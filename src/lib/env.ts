import { CAMPUS_ID, CURSUS_ID } from "@/lib/commoncore";

/** Single place where live 42 API configuration is read. */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const clientId = process.env.FT_CLIENT_ID ?? "";
const clientSecret = process.env.FT_CLIENT_SECRET ?? "";

export const env = {
  clientId,
  clientSecret,
  hasCredentials: Boolean(clientId && clientSecret),

  campusId: int("FT_CAMPUS_ID", CAMPUS_ID),
  cursusId: int("FT_CURSUS_ID", CURSUS_ID),

  /** Rolling celebration window. */
  windowDays: int("HIGHLIGHTS_WINDOW_DAYS", 7),
  /** Server-side rebuild cadence, seconds. */
  refreshSeconds: int("HIGHLIGHTS_REFRESH_SECONDS", 600),
  /** Hard ceiling on API calls per rebuild, so we never burn the hourly budget. */
  maxApiCalls: int("HIGHLIGHTS_MAX_API_CALLS", 220),

  /** Where the last good snapshot is persisted so restarts are instant. */
  cachePath: process.env.HIGHLIGHTS_CACHE_PATH ?? ".cache/snapshot.json",

  /** Optional shared secret for POST /api/refresh. Empty = open (LAN use). */
  refreshToken: process.env.HIGHLIGHTS_REFRESH_TOKEN ?? "",
} as const;
