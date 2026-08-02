/** Memory + disk snapshot store with section-level last-good semantics. */

import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import type { DiagnosticScope, Snapshot, StudentRef } from "@/lib/contract";
import { dashboardStatus, diagnostic, validDiagnostic } from "@/lib/pipeline/diagnostics";
import { EMPTY_PROFILE_CACHE, type ProfileCache } from "@/lib/pipeline/collect";

const CACHE_VERSION = 11 as const;

interface StoreState {
  snapshot: Snapshot | null;
  profileCache: ProfileCache;
  profileStatus: "collecting" | "partial" | "ready";
  sectionLastSuccess: Partial<Record<DiagnosticScope, string>>;
  builtAt: number;
  building: Promise<Snapshot> | null;
  presenceBuilding: Promise<void> | null;
  timer: NodeJS.Timeout | null;
  presenceTimer: NodeJS.Timeout | null;
  loadedFromDisk: boolean;
}

interface StoredState {
  snapshot: Snapshot;
  profileCache: ProfileCache;
  profileStatus: "collecting" | "partial" | "ready";
  sectionLastSuccess: Partial<Record<DiagnosticScope, string>>;
}

interface CacheEnvelopeV11 extends StoredState { version: typeof CACHE_VERSION }

const globalStore = globalThis as typeof globalThis & { __highlightsStoreV11?: StoreState };
const state: StoreState = (globalStore.__highlightsStoreV11 ??= {
  snapshot: null,
  profileCache: EMPTY_PROFILE_CACHE,
  profileStatus: "collecting",
  sectionLastSuccess: {},
  builtAt: 0,
  building: null,
  presenceBuilding: null,
  timer: null,
  presenceTimer: null,
  loadedFromDisk: false,
});

const cacheRoot = process.env.INIT_CWD?.trim() || process.cwd();
const cacheFile = path.isAbsolute(env.cachePath)
  ? env.cachePath
  : path.resolve(cacheRoot, env.cachePath);

function validSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Snapshot>;
  if (["source", "warnings", "community", "readyToShip", "ticker"].some((key) => key in value)) return false;
  return Boolean(
    typeof row.generatedAt === "string" &&
      Number.isFinite(Date.parse(row.generatedAt)) &&
      row.campus && row.cursus && row.weekly && row.connect && row.campusActivity &&
      Array.isArray(row.celebrations) &&
      Array.isArray(row.diagnostics) && row.diagnostics.every(validDiagnostic),
  );
}

function validProfileCache(value: unknown): value is ProfileCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as Partial<ProfileCache>;
  const allowed = new Set(["id", "login", "displayName", "image", "syncedAt"]);
  return Boolean(
    cache.entries && typeof cache.entries === "object" &&
      Object.values(cache.entries).every((entry) =>
        entry && typeof entry === "object" &&
        Object.keys(entry).every((key) => allowed.has(key)) &&
        Number.isFinite(entry.id) && typeof entry.login === "string" &&
        typeof entry.displayName === "string" &&
        (entry.image === null || typeof entry.image === "string") &&
        typeof entry.syncedAt === "string"
      ) &&
      (cache.syncedAt === null || typeof cache.syncedAt === "string"),
  );
}

export function parseStoredState(value: unknown): StoredState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CacheEnvelopeV11>;
  const envelopeKeys = new Set([
    "version", "snapshot", "profileCache", "profileStatus", "sectionLastSuccess",
  ]);
  if (Object.keys(candidate).some((key) => !envelopeKeys.has(key))) return null;
  if (
    candidate.version !== CACHE_VERSION ||
    !validSnapshot(candidate.snapshot) ||
    !validProfileCache(candidate.profileCache) ||
    !["collecting", "partial", "ready"].includes(String(candidate.profileStatus)) ||
    !candidate.sectionLastSuccess || typeof candidate.sectionLastSuccess !== "object"
  ) return null;
  return {
    snapshot: candidate.snapshot,
    profileCache: candidate.profileCache,
    profileStatus: candidate.profileStatus as StoredState["profileStatus"],
    sectionLastSuccess: candidate.sectionLastSuccess,
  };
}

export function annotateLastGood(previous: Snapshot, error: unknown, observedAt = new Date()): Snapshot {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...previous,
    diagnostics: [
      ...previous.diagnostics.filter((item) => item.code !== "refresh_failed"),
      diagnostic(
        "refresh_failed",
        "pipeline",
        "error",
        `Refresh failed; showing the last good snapshot. ${message}`,
        true,
        observedAt,
      ),
    ],
  };
}

export function retainConnectSections(
  previous: Snapshot["connect"],
  current: Snapshot["connect"],
  completeness: { needsEvaluator: boolean; teamUp: boolean; evaluations: boolean },
): Snapshot["connect"] {
  const needsEvaluator = completeness.needsEvaluator
    ? current.needsEvaluator
    : { status: "partial" as const, open: null, projects: [], requests: [] };
  const teamUp = completeness.teamUp
    ? current.teamUp
    : { ...previous.teamUp, status: "partial" as const };
  const peerContributors = completeness.evaluations
    ? current.peerContributors
    : { ...previous.peerContributors, status: "partial" as const };
  const statuses = [needsEvaluator.status, teamUp.status, peerContributors.status];
  return {
    status: statuses.every((status) => status === "ready") ? "ready" : "partial",
    needsEvaluator,
    teamUp,
    peerContributors,
  };
}

function retainCoalitionState(
  previous: Snapshot["campusActivity"],
  current: Snapshot["campusActivity"],
): Snapshot["campusActivity"] {
  const currentById = new Map(current.coalitions.map((coalition) => [coalition.id, coalition]));
  const coalitions = previous.coalitions.map((coalition) => {
    const fresh = currentById.get(coalition.id);
    currentById.delete(coalition.id);
    const topPoints = fresh?.topPointsContributor ?? coalition.topPointsContributor;
    const topTime = fresh?.topTimeContributor ?? coalition.topTimeContributor ?? null;
    return {
      ...(fresh ?? coalition),
      topPointsContributor: topPoints,
      topTimeContributor: topTime,
    };
  });
  coalitions.push(...[...currentById.values()].map((coalition) => {
    return {
      ...coalition,
      topPointsContributor: coalition.topPointsContributor ?? null,
      topTimeContributor: coalition.topTimeContributor ?? null,
    };
  }));
  coalitions.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  return {
    ...current,
    status: "partial",
    coalitions,
    coalitionScoreStatus: "partial",
    coalitionContributorStatus: "partial",
  };
}

function profileStudents(cache: ProfileCache): StudentRef[] {
  return Object.values(cache.entries).map((entry) => ({
    id: entry.id,
    login: entry.login,
    displayName: entry.displayName,
    image: entry.image,
    level: 0,
  }));
}

async function readDisk(): Promise<StoredState | null> {
  try {
    const stored = parseStoredState(JSON.parse(await fs.readFile(cacheFile, "utf8")));
    if (!stored) return null;
    if (stored.snapshot.campus.id !== env.campusId || stored.snapshot.cursus.id !== env.cursusId) return null;
    return stored;
  } catch {
    return null;
  }
}

async function writeDisk(stored: StoredState): Promise<void> {
  try {
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    const temporary = `${cacheFile}.${process.pid}.tmp`;
    const envelope: CacheEnvelopeV11 = { version: CACHE_VERSION, ...stored };
    await fs.writeFile(temporary, JSON.stringify(envelope), "utf8");
    await fs.rename(temporary, cacheFile);
  } catch {
    // A read-only deployment can still use the in-memory snapshot.
  }
}

function currentStored(snapshot = state.snapshot): StoredState | null {
  return snapshot ? {
    snapshot,
    profileCache: state.profileCache,
    profileStatus: state.profileStatus,
    sectionLastSuccess: state.sectionLastSuccess,
  } : null;
}

async function build(): Promise<StoredState> {
  const started = Date.now();
  const [{ collect }, { transform }] = await Promise.all([
    import("@/lib/pipeline/collect"),
    import("@/lib/pipeline/transform"),
  ]);
  const raw = await collect(state.profileCache);
  const completedAt = new Date();
  const transformed = transform(raw, completedAt);
  let connect = transformed.connect;
  let campusActivity = transformed.campusActivity;
  if (state.snapshot) {
    connect = retainConnectSections(state.snapshot.connect, connect, {
      needsEvaluator: raw.waitingComplete && raw.futureEvaluationsComplete,
      teamUp: raw.teamUpComplete,
      evaluations: raw.evaluationsComplete,
    });
    if (!raw.presence.coalitionsComplete) {
      campusActivity = retainCoalitionState(
        state.snapshot.campusActivity,
        campusActivity,
      );
    }
  }
  const snapshot = {
    ...transformed,
    connect,
    campusActivity,
    buildMs: Math.max(1, Date.now() - started),
  };
  const sectionLastSuccess = { ...state.sectionLastSuccess };
  for (const scope of raw.successfulScopes) sectionLastSuccess[scope] = completedAt.toISOString();
  return {
    snapshot,
    profileCache: raw.profileCache,
    profileStatus: raw.profileStatus === "complete" ? "ready" : "partial",
    sectionLastSuccess,
  };
}

export function refresh(): Promise<Snapshot> {
  if (state.building) return state.building;
  if (state.presenceBuilding) return state.presenceBuilding.then(() => refresh());
  const previous = state.snapshot;
  state.building = build()
    .then(async (stored) => {
      state.snapshot = stored.snapshot;
      state.profileCache = stored.profileCache;
      state.profileStatus = stored.profileStatus;
      state.sectionLastSuccess = stored.sectionLastSuccess;
      state.builtAt = Date.parse(stored.snapshot.generatedAt) || Date.now();
      await writeDisk(stored);
      return stored.snapshot;
    })
    .catch((error: unknown) => {
      if (!previous) throw error;
      state.snapshot = annotateLastGood(previous, error);
      return state.snapshot;
    })
    .finally(() => { state.building = null; });
  return state.building;
}

async function refreshPresence(): Promise<void> {
  if (!state.snapshot || state.building || state.presenceBuilding) return;
  state.presenceBuilding = (async () => {
    const [{ collectPresence }, { buildCampusActivity }] = await Promise.all([
      import("@/lib/pipeline/collect"),
      import("@/lib/pipeline/transform"),
    ]);
    const current = state.snapshot;
    if (!current) return;
    const extraUserIds = [
      ...current.celebrations.map((row) => row.student.id),
      ...current.connect.needsEvaluator.requests.map((row) => row.student.id),
      ...current.connect.teamUp.requests.map((row) => row.student.id),
      ...current.connect.peerContributors.evaluators.map((row) => row.student.id),
      ...current.campusActivity.topStudents.map((row) => row.id),
      ...current.campusActivity.coalitions.flatMap((row) => [
        row.topPointsContributor?.student.id,
        row.topTimeContributor?.student.id,
      ]),
      ...Object.keys(state.profileCache.entries).map(Number),
    ];
    const bundle = await collectPresence(
      new Date(),
      current.campus.timeZone,
      true,
      extraUserIds.filter((id): id is number => Number.isFinite(id)),
    );
    if (!state.snapshot) return;
    const retained = state.snapshot.diagnostics.filter(
      (row) => !["locations", "coalitions"].includes(row.scope),
    );
    let campusActivity = buildCampusActivity(
      bundle,
      [],
      new Date(bundle.observedAt),
      state.snapshot.campusActivity.topStudents,
      profileStudents(state.profileCache),
    );
    if (!bundle.coalitionsComplete) {
      campusActivity = retainCoalitionState(
        state.snapshot.campusActivity,
        campusActivity,
      );
    }
    state.snapshot = {
      ...state.snapshot,
      campusActivity,
      diagnostics: [...retained, ...bundle.diagnostics],
    };
    state.sectionLastSuccess.locations = bundle.observedAt;
    if (!bundle.diagnostics.some((row) => row.scope === "coalitions" && row.severity !== "info")) {
      state.sectionLastSuccess.coalitions = bundle.observedAt;
    }
    const stored = currentStored();
    if (stored) await writeDisk(stored);
  })().catch(() => undefined).finally(() => { state.presenceBuilding = null; });
  return state.presenceBuilding;
}

export async function getSnapshot(): Promise<Snapshot> {
  if (state.snapshot) {
    ensureTimers();
    return state.snapshot;
  }
  if (!state.loadedFromDisk) {
    state.loadedFromDisk = true;
    const disk = await readDisk();
    if (disk) {
      state.snapshot = disk.snapshot;
      state.profileCache = disk.profileCache;
      state.profileStatus = disk.profileStatus;
      state.sectionLastSuccess = disk.sectionLastSuccess;
      state.builtAt = Date.parse(disk.snapshot.generatedAt) || 0;
      ensureTimers();
      if (isStale()) void refresh();
      else void refreshPresence();
      return disk.snapshot;
    }
  }
  const snapshot = await refresh();
  ensureTimers();
  return snapshot;
}

export function isStale(): boolean {
  if (!state.snapshot) return true;
  if (state.snapshot.diagnostics.some((item) => item.code === "refresh_failed")) return true;
  return Date.now() - state.builtAt > env.refreshSeconds * 1000;
}

export function secondsUntilRefresh(): number {
  if (isStale()) return 0;
  return Math.max(0, Math.round(env.refreshSeconds - (Date.now() - state.builtAt) / 1000));
}

export function getStoreHealth() {
  const snapshot = state.snapshot;
  return {
    cacheVersion: CACHE_VERSION,
    loadedFromDisk: state.loadedFromDisk,
    hasSnapshot: snapshot !== null,
    generatedAt: snapshot?.generatedAt ?? null,
    status: dashboardStatus(snapshot, isStale()),
    diagnostics: snapshot?.diagnostics ?? [],
    sectionLastSuccess: state.sectionLastSuccess,
    connect: snapshot?.connect.status ?? null,
    needsEvaluator: snapshot?.connect.needsEvaluator.status ?? null,
    teamUp: snapshot?.connect.teamUp.status ?? null,
    peerContributors: snapshot?.connect.peerContributors.status ?? null,
    campusActivity: snapshot?.campusActivity.status ?? null,
    activeSeats: snapshot?.campusActivity.activeSeatStatus ?? null,
    coalitionContributors: snapshot?.campusActivity.coalitionContributorStatus ?? null,
    coalitionScores: snapshot?.campusActivity.coalitionScoreStatus ?? null,
    profiles: state.profileStatus,
  };
}

function ensureTimers(): void {
  if (!state.timer) {
    state.timer = setInterval(() => { void refresh().catch(() => undefined); }, env.refreshSeconds * 1000);
    state.timer.unref?.();
  }
  if (!state.presenceTimer) {
    state.presenceTimer = setInterval(() => { void refreshPresence(); }, 120_000);
    state.presenceTimer.unref?.();
  }
}
