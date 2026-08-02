/** Collect the API feeds used by the dashboard scenes. */

import { env } from "@/lib/env";
import type { DataDiagnostic, DiagnosticScope } from "@/lib/contract";
import { BudgetExceededError, ft } from "@/lib/ft/client";
import type {
  FtCampus,
  FtBloc,
  FtCoalition,
  FtCoalitionUser,
  FtCursusUser,
  FtLocation,
  FtProject,
  FtProjectsUser,
  FtScaleTeam,
  FtUserRef,
} from "@/lib/ft/types";
import { campusWeekStart } from "@/lib/pipeline/campus-time";
import { diagnostic } from "@/lib/pipeline/diagnostics";

export interface PresenceBundle {
  locations: FtLocation[];
  /** Exact response from `filter[active]=true`; never reconstructed from history. */
  activeLocations: FtLocation[];
  coalitionMemberships: FtCoalitionUser[];
  coalitions: FtCoalition[];
  locationsComplete: boolean;
  activeLocationsComplete: boolean;
  coalitionsComplete: boolean;
  observedAt: string;
  weekStart: string;
  diagnostics: DataDiagnostic[];
  apiCalls: number;
}

export interface ProfileCacheEntry {
  id: number;
  login: string;
  displayName: string;
  image: string | null;
  syncedAt: string;
}

export interface ProfileCache {
  entries: Record<string, ProfileCacheEntry>;
  syncedAt: string | null;
}

export const EMPTY_PROFILE_CACHE: ProfileCache = { entries: {}, syncedAt: null };
type ProfileHydrationStatus = "complete" | "partial";

export interface RawBundle {
  campusId: number;
  cursusId: number;
  campus: FtCampus | null;
  roster: FtCursusUser[];
  profileCache: ProfileCache;
  profileStatus: ProfileHydrationStatus;
  marked: FtProjectsUser[];
  waitingForCorrection: FtProjectsUser[];
  searchingForGroup: FtProjectsUser[];
  futureScaleTeams: FtScaleTeam[];
  scaleTeams: FtScaleTeam[];
  projects: FtProject[];
  presence: PresenceBundle;
  windowDays: number;
  since: string;
  until: string;
  startedAt: string;
  apiCalls: number;
  diagnostics: DataDiagnostic[];
  successfulScopes: DiagnosticScope[];
  waitingComplete: boolean;
  teamUpComplete: boolean;
  futureEvaluationsComplete: boolean;
  evaluationsComplete: boolean;
}

const PROFILE_BATCH = 50;
let projectsCache: FtProject[] | null = null;

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

function describe(error: unknown): string {
  if (error instanceof BudgetExceededError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size),
  );
}

export function compactProfile(user: FtUserRef, syncedAt: string): ProfileCacheEntry {
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayname?.trim() || user.usual_full_name?.trim() || user.login,
    image: user.image?.link ?? user.image?.versions?.medium ?? null,
    syncedAt,
  };
}

export function profileIdBatches(userIds: readonly number[]): number[][] {
  return chunks(userIds, PROFILE_BATCH);
}

export function cachedProfilesForRoster(
  previous: ProfileCache,
  rosterIds: readonly number[],
): Record<string, ProfileCacheEntry> {
  const entries: Record<string, ProfileCacheEntry> = {};
  for (const id of rosterIds) {
    const cached = previous.entries[String(id)];
    if (cached) entries[String(id)] = cached;
  }
  return entries;
}

export function finaliseProfileCache(
  entries: Record<string, ProfileCacheEntry>,
  attemptedAt: string,
  previousSyncedAt: string | null,
  complete: boolean,
): ProfileCache {
  return { entries, syncedAt: complete ? attemptedAt : previousSyncedAt };
}

/** Select one authoritative current bloc instead of inferring coalitions from legacy memberships. */
export function currentCoalitionsFromBlocs(blocs: readonly FtBloc[]): FtCoalition[] {
  const current = [...blocs]
    .filter((bloc) => (bloc.coalitions?.length ?? 0) > 0)
    .sort((a, b) =>
      (timeValue(b.created_at) - timeValue(a.created_at)) || b.id - a.id,
    )[0];
  return current?.coalitions ?? [];
}

function timeValue(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function collectPresence(
  now = new Date(),
  timeZone = "Europe/Warsaw",
  resetBudget = true,
  extraUserIds: readonly number[] = [],
): Promise<PresenceBundle> {
  if (resetBudget) ft.resetCalls(Math.min(env.maxApiCalls, 100));
  const callsBefore = ft.callCount;
  const weekStart = campusWeekStart(now, timeZone);
  const diagnostics: DataDiagnostic[] = [];
  const warn = (
    message: string,
    code: string,
    scope: "locations" | "coalitions",
    severity: DataDiagnostic["severity"] = "warning",
  ) => {
    diagnostics.push(diagnostic(code, scope, severity, message, true, now));
  };

  let weekLocations: FtLocation[] = [];
  let activeLocations: FtLocation[] = [];
  let locationsComplete = true;
  let activeLocationsComplete = true;
  try {
    weekLocations = await ft.getAll<FtLocation>(
      `/campus/${env.campusId}/locations`,
      {
        "range[begin_at]": `${weekStart.toISOString()},${now.toISOString()}`,
        sort: "begin_at",
      },
      {
        maxPages: 30,
        onWarning: (message) => {
          locationsComplete = false;
          warn(message, "locations_truncated", "locations");
        },
      },
    );
  } catch (error) {
    locationsComplete = false;
    warn(`Workstation sessions unavailable (${describe(error)}).`, "locations_failed", "locations");
  }

  try {
    activeLocations = await ft.getAll<FtLocation>(
      `/campus/${env.campusId}/locations`,
      { "filter[active]": true },
      {
        maxPages: 5,
        onWarning: (message) => {
          activeLocationsComplete = false;
          warn(message, "active_locations_truncated", "locations");
        },
      },
    );
  } catch (error) {
    activeLocationsComplete = false;
    warn(`Current workstation occupancy unavailable (${describe(error)}).`, "active_locations_failed", "locations");
  }

  const locations = [
    ...new Map([...weekLocations, ...activeLocations].map((row) => [row.id, row])).values(),
  ];

  const userIds = [
    ...new Set(
      [...locations.map((row) => row.user?.id), ...extraUserIds]
        .filter((id): id is number => Number.isFinite(id)),
    ),
  ];
  const coalitionMemberships: FtCoalitionUser[] = [];
  let coalitions: FtCoalition[] = [];
  let coalitionsComplete = true;
  try {
    for (const batch of chunks(userIds, 50)) {
      coalitionMemberships.push(
        ...(await ft.getAll<FtCoalitionUser>(
          "/coalitions_users",
          { "filter[user_id]": batch.join(",") },
          {
            maxPages: 5,
            onWarning: (message) => {
              coalitionsComplete = false;
              warn(message, "coalition_membership_truncated", "coalitions");
            },
          },
        )),
      );
    }
  } catch (error) {
    coalitionsComplete = false;
    warn(`Coalition membership unavailable (${describe(error)}).`, "coalitions_failed", "coalitions");
  }

  try {
    const blocs = await ft.getAll<FtBloc>(
      "/blocs",
      {
        "filter[campus_id]": env.campusId,
        "filter[cursus_id]": env.cursusId,
        sort: "-created_at",
      },
      {
        maxPages: 2,
        onWarning: (message) => {
          coalitionsComplete = false;
          warn(message, "coalition_blocs_truncated", "coalitions");
        },
      },
    );
    const currentCoalitions = currentCoalitionsFromBlocs(blocs);
    if (currentCoalitions.length === 0) {
      coalitionsComplete = false;
      warn("No current Warsaw Common Core coalition bloc was returned.", "coalition_bloc_missing", "coalitions");
    } else {
      coalitions = currentCoalitions;
    }
  } catch (error) {
    coalitionsComplete = false;
    warn(`Current coalition bloc unavailable (${describe(error)}).`, "coalition_bloc_failed", "coalitions");
  }

  return {
    locations,
    activeLocations,
    coalitionMemberships,
    coalitions,
    locationsComplete,
    activeLocationsComplete,
    coalitionsComplete,
    observedAt: now.toISOString(),
    weekStart: weekStart.toISOString(),
    diagnostics,
    apiCalls: Math.max(0, ft.callCount - callsBefore),
  };
}

export async function collect(
  previousProfiles: ProfileCache = EMPTY_PROFILE_CACHE,
): Promise<RawBundle> {
  if (!env.hasCredentials) {
    throw new Error("FT_CLIENT_ID / FT_CLIENT_SECRET are not configured for live mode");
  }

  const now = new Date();
  const windowDays = Math.max(1, env.windowDays);
  // Weekly comparisons need the current and previous week even when the
  // visible completion window is configured to seven days.
  const since = isoDaysAgo(now, Math.max(14, windowDays));
  const until = now.toISOString();
  const diagnostics: DataDiagnostic[] = [];
  const successfulScopes = new Set<DiagnosticScope>();
  let rosterRequestSucceeded = false;
  let markedRequestSucceeded = false;
  let waitingRequestComplete = true;
  let searchingRequestComplete = true;
  let futureEvaluationsComplete = true;
  let evaluationsComplete = true;
  const warn = (
    message: string,
    code = "collector_warning",
    scope: DiagnosticScope = "pipeline",
    fallbackActive = false,
    severity: DataDiagnostic["severity"] = "warning",
  ): void => {
    diagnostics.push(diagnostic(code, scope, severity, message, fallbackActive, now));
  };
  const success = (scope: DiagnosticScope) => successfulScopes.add(scope);

  const bundle: RawBundle = {
    campusId: env.campusId,
    cursusId: env.cursusId,
    campus: null,
    roster: [],
    profileCache: {
      entries: { ...previousProfiles.entries },
      syncedAt: previousProfiles.syncedAt,
    },
    profileStatus: "partial",
    marked: [],
    waitingForCorrection: [],
    searchingForGroup: [],
    futureScaleTeams: [],
    scaleTeams: [],
    projects: [],
    presence: {
      locations: [], activeLocations: [], coalitionMemberships: [], coalitions: [],
      locationsComplete: false, activeLocationsComplete: false, coalitionsComplete: false,
      observedAt: now.toISOString(),
      weekStart: campusWeekStart(now, "Europe/Warsaw").toISOString(), diagnostics: [], apiCalls: 0,
    },
    windowDays,
    since,
    until,
    startedAt: now.toISOString(),
    apiCalls: 0,
    diagnostics,
    successfulScopes: [],
    waitingComplete: false,
    teamUpComplete: false,
    futureEvaluationsComplete: false,
    evaluationsComplete: false,
  };

  ft.resetCalls(env.maxApiCalls);
  try {
    bundle.campus = (await ft.get<FtCampus>(`/campus/${env.campusId}`)).data;
    success("campus");
  } catch (error) {
    warn(`Campus metadata unavailable (${describe(error)}). Using Warsaw defaults.`, "campus_lookup_failed", "campus", true);
  }

  try {
    bundle.roster = await ft.getAll<FtCursusUser>(
      "/cursus_users",
      { "filter[cursus_id]": env.cursusId, "filter[campus_id]": env.campusId, "filter[active]": true, sort: "-level" },
      { maxPages: 12, onWarning: (message) => warn(message, "roster_truncated", "roster") },
    );
    rosterRequestSucceeded = true;
    success("roster");
  } catch (error) {
    warn(`Active roster unavailable (${describe(error)}).`, "roster_fetch_failed", "roster");
  }

  if (rosterRequestSucceeded) {
    const rosterIds = [
      ...new Set(
        bundle.roster
          .map((row) => row.user?.id)
          .filter((id): id is number => Number.isFinite(id)),
      ),
    ];
    const entries = cachedProfilesForRoster(previousProfiles, rosterIds);
    let profilesComplete = true;
    const syncedAt = now.toISOString();
    for (const batch of profileIdBatches(rosterIds)) {
      try {
        const profiles = await ft.getAll<FtUserRef>(
          "/users",
          { "filter[id]": batch.join(","), sort: "id" },
          {
            maxPages: 2,
            onWarning: (message) => {
              profilesComplete = false;
              warn(message, "profiles_truncated", "profiles", true);
            },
          },
        );
        for (const profile of profiles) {
          if (!Number.isFinite(profile.id) || !profile.login?.trim()) continue;
          entries[String(profile.id)] = compactProfile(profile, syncedAt);
        }
        const returned = new Set(profiles.map((profile) => profile.id));
        if (batch.some((id) => !returned.has(id))) {
          profilesComplete = false;
          warn(
            "The profile endpoint omitted one or more active-roster students; cached public fields remain in use where available.",
            "profiles_missing",
            "profiles",
            true,
          );
        }
      } catch (error) {
        profilesComplete = false;
        warn(`Student profiles unavailable for one roster batch (${describe(error)}).`, "profiles_batch_failed", "profiles", true);
      }
    }
    bundle.profileCache = finaliseProfileCache(
      entries,
      syncedAt,
      previousProfiles.syncedAt,
      profilesComplete,
    );
    bundle.profileStatus = profilesComplete ? "complete" : "partial";
    if (profilesComplete) success("profiles");
  }

  try {
    bundle.marked = await ft.getAll<FtProjectsUser>(
      "/projects_users",
      { "filter[campus]": env.campusId, "filter[cursus]": env.cursusId, "filter[marked]": true, "range[marked_at]": `${since},${until}`, sort: "-marked_at" },
      { maxPages: 10, onWarning: (message) => warn(message, "marked_attempts_truncated", "projects") },
    );
    markedRequestSucceeded = true;
    success("projects");
  } catch (error) {
    warn(`Recent project attempts unavailable (${describe(error)}).`, "marked_attempts_failed", "projects");
  }

  async function statusRows(
    status: string,
    markTruncated: () => void,
    scope: DiagnosticScope = "projects",
  ): Promise<FtProjectsUser[]> {
    return ft.getAll<FtProjectsUser>(
      "/projects_users",
      { "filter[campus]": env.campusId, "filter[cursus]": env.cursusId, "filter[status]": status },
      {
        maxPages: 12,
        onWarning: (message) => {
          markTruncated();
          warn(message, `${status}_truncated`, scope);
        },
      },
    );
  }
  try {
    bundle.waitingForCorrection = await statusRows("waiting_for_correction", () => { waitingRequestComplete = false; });
  } catch (error) {
    waitingRequestComplete = false;
    warn(`Waiting-for-correction counts unavailable (${describe(error)}).`, "waiting_for_correction_failed", "projects");
  }
  bundle.waitingComplete = waitingRequestComplete;

  try {
    bundle.searchingForGroup = await statusRows(
      "searching_a_group",
      () => { searchingRequestComplete = false; },
      "team_up",
    );
    if (searchingRequestComplete) success("team_up");
  } catch (error) {
    searchingRequestComplete = false;
    warn(`Team-up requests unavailable (${describe(error)}).`, "searching_a_group_failed", "team_up");
  }
  bundle.teamUpComplete = searchingRequestComplete;

  try {
    bundle.futureScaleTeams = await ft.getAll<FtScaleTeam>(
      "/scale_teams",
      {
        "filter[campus_id]": env.campusId,
        "filter[cursus_id]": env.cursusId,
        "filter[future]": true,
        sort: "begin_at",
      },
      {
        maxPages: 6,
        onWarning: (message) => {
          futureEvaluationsComplete = false;
          warn(message, "future_evaluations_truncated", "evaluations");
        },
      },
    );
  } catch (error) {
    futureEvaluationsComplete = false;
    warn(`Future peer-evaluation appointments unavailable (${describe(error)}).`, "future_evaluations_failed", "evaluations");
  }
  bundle.futureEvaluationsComplete = futureEvaluationsComplete;

  try {
    bundle.scaleTeams = await ft.getAll<FtScaleTeam>(
      "/scale_teams",
      { "filter[campus_id]": env.campusId, "filter[cursus_id]": env.cursusId, "filter[filled]": true, "range[filled_at]": `${since},${until}`, sort: "-filled_at" },
      {
        maxPages: 6,
        onWarning: (message) => {
          evaluationsComplete = false;
          warn(message, "evaluations_truncated", "evaluations");
        },
      },
    );
    if (evaluationsComplete) success("evaluations");
  } catch (error) {
    evaluationsComplete = false;
    warn(`Peer evaluation feed unavailable (${describe(error)}).`, "evaluations_failed", "evaluations");
  }
  bundle.evaluationsComplete = evaluationsComplete;

  try {
    if (!projectsCache) {
      const projects = await ft.getAll<FtProject>(`/cursus/${env.cursusId}/projects`, {}, { maxPages: 3 });
      if (projects.length > 0) projectsCache = projects;
    }
    bundle.projects = projectsCache ?? [];
  } catch (error) {
    warn(`Project catalogue unavailable (${describe(error)}). Using checked-in metadata.`, "project_catalogue_fallback", "projects", true, "info");
  }

  const coalitionIdentityIds = new Set<number>();
  for (const row of bundle.roster) {
    if (Number.isFinite(row.user?.id)) coalitionIdentityIds.add(row.user!.id);
  }
  for (const row of [
    ...bundle.marked,
    ...bundle.waitingForCorrection,
    ...bundle.searchingForGroup,
  ]) {
    if (Number.isFinite(row.user?.id)) coalitionIdentityIds.add(row.user!.id);
  }
  for (const row of bundle.marked) {
    for (const teammate of row.teams?.flatMap((team) => team.users ?? []) ?? []) {
      if (Number.isFinite(teammate.id)) coalitionIdentityIds.add(teammate.id);
    }
  }
  for (const row of bundle.scaleTeams) {
    if (row.corrector && typeof row.corrector === "object" && Number.isFinite(row.corrector.id)) {
      coalitionIdentityIds.add(row.corrector.id);
    }
  }
  bundle.presence = await collectPresence(
    now,
    bundle.campus?.time_zone || "Europe/Warsaw",
    false,
    [...coalitionIdentityIds],
  );
  diagnostics.push(...bundle.presence.diagnostics);
  if (bundle.presence.locationsComplete && bundle.presence.activeLocationsComplete) success("locations");
  if (bundle.presence.coalitionsComplete) success("coalitions");

  if (!rosterRequestSucceeded && !markedRequestSucceeded) {
    throw new Error("Both critical 42 API feeds failed: roster and recent project attempts");
  }
  bundle.apiCalls = ft.callCount;
  bundle.successfulScopes = [...successfulScopes];
  return bundle;
}
