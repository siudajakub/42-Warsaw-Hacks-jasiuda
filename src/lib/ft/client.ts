/**
 * 42 Intra API client: OAuth2 (client_credentials), a serial rate limiter, and
 * pagination.
 *
 * Why it is shaped like this
 * -------------------------
 * The 42 API allows **2 requests/second and 1200 requests/hour per client_id**.
 * Both budgets are easy to blow: a single naive `Promise.all` over 10 pages
 * trips the secondly limit instantly. Even at a ten-minute cadence we keep
 * explicit page caps and headroom for manual refreshes and retries.
 *
 * So: one global promise-chain queue (maxConcurrent = 1) with a minimum gap
 * between requests, seeded at 550ms (safely under 2/s) and then *adapted* from
 * the real limit the server advertises. The headers are
 * `x-secondly-ratelimit-*` / `x-hourly-ratelimit-*` — NOT the `X-RateLimit-*`
 * spelling most APIs use, and not what most HTTP helper libraries look for.
 *
 * On top of that a hard call budget (env.maxApiCalls). When it is exhausted we
 * throw `BudgetExceededError`, which the collector treats as "stop fetching,
 * keep what you have, add a warning" rather than as a fatal error. A partial
 * dashboard that says so is worth more than a blank one.
 */

import { env } from "@/lib/env";
import type { FtTokenResponse } from "@/lib/ft/types";

const API_BASE = "https://api.intra.42.fr/v2";
const TOKEN_URL = "https://api.intra.42.fr/oauth/token";

/** Conservative default: 2 req/s => 500ms, plus margin for clock drift. */
const DEFAULT_SPACING_MS = 550;
/** Re-request the token this long before it actually expires. */
const TOKEN_SKEW_MS = 60_000;
/** The API caps page[size] at 100; anything larger is silently clamped. */
const MAX_PAGE_SIZE = 100;

const MAX_RATE_RETRIES = 8;
const MAX_SERVER_RETRIES = 4;

type RetryAction = "refresh-token" | "retry-rate-limit" | "retry-server" | "fail";

/** Pure policy used by the client and its failure-mode tests. */
export function retryAction(
  status: number,
  retries: { auth: number; rate: number; server: number },
): RetryAction {
  if (status === 401 && retries.auth < 1) return "refresh-token";
  if (status === 429 && retries.rate < MAX_RATE_RETRIES) return "retry-rate-limit";
  if (status >= 500 && retries.server < MAX_SERVER_RETRIES) return "retry-server";
  return "fail";
}

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

interface FtResponse<T> {
  data: T;
  /** `X-Total` — the total ITEM count for the collection, not a page count. */
  total: number;
  headers: Headers;
}

interface GetAllOptions {
  /** Hard cap on pages fetched. Truncation is reported via `onWarning`. */
  maxPages?: number;
  /** Called for non-fatal degradations (truncation, budget exhaustion). */
  onWarning?: (message: string) => void;
}

interface RateLimitState {
  secondlyLimit: number | null;
  hourlyLimit: number | null;
  hourlyRemaining: number | null;
  spacingMs: number;
}

/** Thrown when the per-rebuild call budget is spent. Recoverable by design. */
export class BudgetExceededError extends Error {
  readonly budget: number;
  readonly spent: number;

  constructor(budget: number, spent: number) {
    super(`42 API call budget exhausted (${spent}/${budget} calls)`);
    this.name = "BudgetExceededError";
    this.budget = budget;
    this.spent = spent;
  }
}

/** Any non-retryable HTTP failure. */
class FtHttpError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: string;

  constructor(status: number, path: string, body: string) {
    super(`42 API ${status} on ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    this.name = "FtHttpError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function jitter(maxMs: number): number {
  return Math.random() * maxMs;
}

function toNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

interface TokenCache {
  accessToken: string;
  /** Epoch ms at which we consider the token dead (already skew-adjusted). */
  expiresAt: number;
}

class FtClient {
  /** Minimum gap between two HTTP requests. Adapted from live headers. */
  private spacingMs = DEFAULT_SPACING_MS;
  private lastRequestAt = 0;
  /** The queue: every request appends to this chain, so concurrency is 1. */
  private chain: Promise<void> = Promise.resolve();

  private calls = 0;
  private budget = Math.max(1, env.maxApiCalls);

  private secondlyLimit: number | null = null;
  private hourlyLimit: number | null = null;
  private hourlyRemaining: number | null = null;

  /**
   * Module-scope (the client is a singleton) so the token survives across
   * requests in a warm Next.js server instead of being re-minted per render.
   */
  private token: TokenCache | null = null;
  private tokenInFlight: Promise<string> | null = null;

  // ---------------------------------------------------------------- budget

  /** HTTP requests made since the last reset, token requests included. */
  get callCount(): number {
    return this.calls;
  }

  /** Call at the start of each rebuild. */
  resetCalls(budget?: number): void {
    this.calls = 0;
    if (typeof budget === "number" && budget > 0) this.budget = Math.floor(budget);
  }

  get rateLimit(): RateLimitState {
    return {
      secondlyLimit: this.secondlyLimit,
      hourlyLimit: this.hourlyLimit,
      hourlyRemaining: this.hourlyRemaining,
      spacingMs: this.spacingMs,
    };
  }

  // ----------------------------------------------------------------- queue

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task);
    // Swallow rejections on the chain itself, otherwise one failed request
    // would poison every request queued behind it.
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Blocks until at least `spacingMs` has passed since the last request. */
  private async pace(): Promise<void> {
    const wait = this.spacingMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  /**
   * Auto-discovery: the first successful response tells us the real limits, so
   * we stop guessing. floor(1000 / secondly) + 30ms of margin.
   */
  private absorbRateHeaders(headers: Headers): void {
    const secondly = toNumber(headers.get("x-secondly-ratelimit-limit"));
    if (secondly !== null && secondly > 0) {
      this.secondlyLimit = secondly;
      const adapted = Math.floor(1000 / secondly) + 30;
      if (adapted !== this.spacingMs) this.spacingMs = adapted;
    }
    const hourly = toNumber(headers.get("x-hourly-ratelimit-limit"));
    if (hourly !== null) this.hourlyLimit = hourly;
    const hourlyLeft = toNumber(headers.get("x-hourly-ratelimit-remaining"));
    if (hourlyLeft !== null) this.hourlyRemaining = hourlyLeft;
  }

  private spend(): void {
    if (this.calls >= this.budget) throw new BudgetExceededError(this.budget, this.calls);
    this.calls += 1;
  }

  // ----------------------------------------------------------------- token

  /**
   * client_credentials has no refresh token: when it expires you simply ask
   * for another one. `tokenInFlight` de-duplicates concurrent refreshes.
   *
   * Deliberately NOT routed through `enqueue()` — it is called from inside a
   * queued task, and re-entering the same promise chain would deadlock.
   */
  private async ensureToken(): Promise<string> {
    const cached = this.token;
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
    if (this.tokenInFlight) return this.tokenInFlight;

    const inFlight = this.mintToken().finally(() => {
      this.tokenInFlight = null;
    });
    this.tokenInFlight = inFlight;
    return inFlight;
  }

  private async mintToken(): Promise<string> {
    if (!env.clientId || !env.clientSecret) {
      throw new Error("FT_CLIENT_ID / FT_CLIENT_SECRET are not configured");
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.clientId,
      client_secret: env.clientSecret,
      scope: "public projects",
    });

    let attempt = 0;
    for (;;) {
      this.spend();
      await this.pace();

      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
        cache: "no-store",
      });

      this.absorbRateHeaders(res.headers);

      if (res.status === 429 && attempt < MAX_RATE_RETRIES) {
        const retryAfter = toNumber(res.headers.get("retry-after")) ?? 1;
        await sleep(Math.max(1, retryAfter) * 1000 + jitter(500));
        attempt += 1;
        continue;
      }
      if (res.status >= 500 && attempt < MAX_SERVER_RETRIES) {
        await sleep(1000 * 2 ** attempt + jitter(400));
        attempt += 1;
        continue;
      }
      if (!res.ok) {
        throw new FtHttpError(res.status, "/oauth/token", await res.text().catch(() => ""));
      }

      const payload = (await res.json()) as FtTokenResponse;
      const ttlMs = (payload.expires_in > 0 ? payload.expires_in : 7200) * 1000;
      this.token = {
        accessToken: payload.access_token,
        expiresAt: Date.now() + Math.max(30_000, ttlMs - TOKEN_SKEW_MS),
      };
      return payload.access_token;
    }
  }

  /** Drops the cached token. Exposed for tests and for 401 recovery. */
  invalidateToken(): void {
    this.token = null;
  }

  // ------------------------------------------------------------------- get

  private buildUrl(path: string, params?: QueryParams): string {
    const search = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        // URLSearchParams percent-encodes the brackets in `page[size]` as
        // `page%5Bsize%5D`, which the 42 API accepts and decodes correctly.
        search.append(key, String(value));
      }
    }
    const query = search.toString();
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${API_BASE}${suffix}${query ? `?${query}` : ""}`;
  }

  /** Single GET, queued and retried. Resolves with body + `X-Total`. */
  get<T>(path: string, params?: QueryParams): Promise<FtResponse<T>> {
    return this.enqueue(() => this.attempt<T>(path, params));
  }

  private async attempt<T>(path: string, params?: QueryParams): Promise<FtResponse<T>> {
    const url = this.buildUrl(path, params);
    let rateRetries = 0;
    let serverRetries = 0;
    let authRetries = 0;

    for (;;) {
      const accessToken = await this.ensureToken();
      this.spend();
      await this.pace();

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          cache: "no-store",
        });
      } catch (cause) {
        // DNS blips and dropped sockets behave like 5xx: retry the GET.
        if (serverRetries >= MAX_SERVER_RETRIES) {
          throw new FtHttpError(0, path, cause instanceof Error ? cause.message : String(cause));
        }
        await sleep(1000 * 2 ** serverRetries + jitter(400));
        serverRetries += 1;
        continue;
      }

      this.absorbRateHeaders(res.headers);

      const action = retryAction(res.status, {
        auth: authRetries,
        rate: rateRetries,
        server: serverRetries,
      });

      if (action === "retry-rate-limit") {
        // Retry-After: 1 means the secondly bucket; anything larger means the
        // hourly budget is gone and we genuinely have to wait it out.
        const retryAfter = toNumber(res.headers.get("retry-after")) ?? 1;
        await sleep(Math.max(1, retryAfter) * 1000 + jitter(500));
        rateRetries += 1;
        continue;
      }

      if (action === "refresh-token") {
        // Token revoked or expired earlier than advertised: mint a fresh one.
        authRetries += 1;
        this.invalidateToken();
        continue;
      }

      if (action === "retry-server") {
        // 502s from the intra gateway are routine, not exceptional.
        await sleep(1000 * 2 ** serverRetries + jitter(400));
        serverRetries += 1;
        continue;
      }

      if (res.status === 429) {
        throw new FtHttpError(429, path, "rate limited, retries exhausted");
      }

      if (!res.ok) {
        throw new FtHttpError(res.status, path, await res.text().catch(() => ""));
      }

      const data = (await res.json()) as T;
      const total = toNumber(res.headers.get("x-total"));
      return {
        data,
        total: total ?? (Array.isArray(data) ? data.length : 1),
        headers: res.headers,
      };
    }
  }

  /**
   * Paginate a collection. Page 1 is fetched first purely to learn `X-Total`
   * (an item count, so pages = ceil(total / size)); pages 2..N then go through
   * the same serial queue. Never parallelised — see the rate-limit note above.
   */
  async getAll<T>(path: string, params?: QueryParams, opts?: GetAllOptions): Promise<T[]> {
    const paged = { ...params, "page[size]": MAX_PAGE_SIZE, "page[number]": 1 };
    const first = await this.get<T[]>(path, paged);
    const items: T[] = Array.isArray(first.data) ? [...first.data] : [];

    if (!Array.isArray(first.data)) return items;

    const totalPages = Math.max(1, Math.ceil(first.total / MAX_PAGE_SIZE));
    const cap = opts?.maxPages && opts.maxPages > 0 ? opts.maxPages : Number.POSITIVE_INFINITY;
    const lastPage = Math.min(totalPages, cap);

    if (totalPages > lastPage) {
      opts?.onWarning?.(
        `${path}: fetched ${lastPage} of ${totalPages} pages (${first.total} items) — page cap reached.`,
      );
    }

    for (let page = 2; page <= lastPage; page += 1) {
      try {
        const res = await this.get<T[]>(path, { ...params, "page[size]": MAX_PAGE_SIZE, "page[number]": page });
        if (!Array.isArray(res.data) || res.data.length === 0) break;
        items.push(...res.data);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          // Keep the pages we already paid for rather than losing the step.
          opts?.onWarning?.(
            `${path}: stopped at page ${page - 1}/${lastPage} — API call budget exhausted.`,
          );
          return items;
        }
        throw err;
      }
    }

    return items;
  }
}

/** Process-wide singleton: one token cache, one queue, one budget. */
export const ft = new FtClient();
