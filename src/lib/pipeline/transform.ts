/** Convert raw 42 API collections into the compact TV Snapshot. */

import { CAMPUS_ID, coreProject, isExamProject, isWorkExperienceProject } from "@/lib/commoncore";
import type {
  ActiveSeatIdentity,
  AchievementKind,
  CampusActivityState,
  CampusPersonTime,
  Celebration,
  CoalitionPointsContributor,
  CoalitionTime,
  CoalitionTimeContributor,
  ConnectState,
  DataDiagnostic,
  NeedsEvaluatorProject,
  NeedsEvaluatorState,
  ConnectRequest,
  PeerContributionState,
  Snapshot,
  StudentRef,
  TeamUpState,
  WeeklyHighlights,
  WorkstationStat,
} from "@/lib/contract";
import type {
  FtCursusUser,
  FtLocation,
  FtProject,
  FtProjectRef,
  FtProjectsUser,
  FtScaleTeam,
  FtUserRef,
} from "@/lib/ft/types";
import type { PresenceBundle, ProfileCacheEntry, RawBundle } from "@/lib/pipeline/collect";
import { campusWeekStart } from "@/lib/pipeline/campus-time";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

interface ProjectMeta {
  id: number;
  name: string;
  slug: string;
  rank: number | null;
  xp: number;
  teamProject: boolean | null;
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isRealAttempt(row: Pick<FtProjectsUser, "status" | "project">): boolean {
  return row.status !== "parent" && Boolean(row.project?.id);
}

function usableUser(user: FtUserRef | null | undefined): user is FtUserRef {
  return Boolean(user && Number.isFinite(user.id) && user.login?.trim());
}

function displayName(user: FtUserRef): string {
  return user.displayname?.trim() || user.usual_full_name?.trim() || user.login;
}

function studentRef(row: FtCursusUser, profile?: ProfileCacheEntry): StudentRef | null {
  if (!usableUser(row.user)) return null;
  return {
    id: row.user.id,
    login: row.user.login,
    displayName: profile?.displayName || displayName(row.user),
    image: profile?.image ?? row.user.image?.link ?? row.user.image?.versions?.medium ?? null,
    level: Number.isFinite(row.level) ? row.level : 0,
  };
}

function personKey(row: FtProjectsUser): string {
  if (Number.isFinite(row.user?.id)) return `id:${row.user?.id}`;
  if (row.user?.login) return `login:${row.user.login}`;
  return `unidentified:${row.id}`;
}

function projectDifficulty(project: FtProject, campusId: number, cursusId: number): number {
  if (Number.isFinite(project.difficulty)) return Math.max(0, project.difficulty ?? 0);
  return Math.max(
    0,
    project.project_sessions?.find(
      (session) =>
        (session.campus_id == null || session.campus_id === campusId) &&
        (session.cursus_id == null || session.cursus_id === cursusId) &&
        Number.isFinite(session.difficulty),
    )?.difficulty ?? 0,
  );
}

function projectResolver(raw: RawBundle): (project: FtProjectRef) => ProjectMeta {
  const catalogue = new Map(raw.projects.map((project) => [project.id, project]));
  return (project) => {
    const api = catalogue.get(project.id);
    const core = coreProject(project.id, project.slug);
    const matchingSessions = api?.project_sessions?.filter(
      (row) =>
        (row.campus_id == null || row.campus_id === raw.campusId) &&
        (row.cursus_id == null || row.cursus_id === raw.cursusId),
    ) ?? [];
    const session = matchingSessions.find((row) => typeof row.solo === "boolean") ?? matchingSessions[0];
    return {
      id: project.id,
      name: api?.name || project.name || core?.name || project.slug,
      slug: api?.slug || project.slug || core?.slug || String(project.id),
      rank: core?.rank ?? null,
      xp: api
        ? projectDifficulty(api, raw.campusId, raw.cursusId) || core?.xp || 0
        : core?.xp ?? 0,
      teamProject: typeof session?.solo === "boolean" ? !session.solo : null,
    };
  };
}

function dedupeDiagnostics(rows: readonly DataDiagnostic[]): DataDiagnostic[] {
  const map = new Map<string, DataDiagnostic>();
  for (const row of rows) map.set(`${row.scope}:${row.code}`, row);
  return [...map.values()];
}

function latestByStudentProject(rows: readonly FtProjectsUser[]): FtProjectsUser[] {
  const map = new Map<string, FtProjectsUser>();
  for (const row of rows) {
    if (!isRealAttempt(row)) continue;
    const key = `${personKey(row)}:${row.project.id}`;
    const previous = map.get(key);
    const currentTime = timeOf(row.marked_at) ?? timeOf(row.updated_at) ?? 0;
    const previousTime = timeOf(previous?.marked_at) ?? timeOf(previous?.updated_at) ?? 0;
    if (!previous || currentTime >= previousTime) map.set(key, row);
  }
  return [...map.values()];
}

function buildCelebrations(
  rows: readonly FtProjectsUser[],
  students: ReadonlyMap<number, StudentRef>,
  studentsByLogin: ReadonlyMap<string, StudentRef>,
  resolveProject: (project: FtProjectRef) => ProjectMeta,
  start: number,
): Celebration[] {
  return rows
    .flatMap((row): Celebration[] => {
      const markedAt = timeOf(row.marked_at);
      const student = row.user?.id ? students.get(row.user.id) : null;
      if (!student || markedAt === null || markedAt < start || row["validated?"] !== true) return [];
      const project = resolveProject(row.project);
      const mark = Number.isFinite(row.final_mark) ? Math.max(0, row.final_mark ?? 0) : 0;
      const occurrence = Math.max(0, row.occurrence || 0);
      const currentTeam = row.teams?.find((team) => team.id === row.current_team_id) ??
        [...(row.teams ?? [])].sort((a, b) =>
          (timeOf(b.updated_at) ?? timeOf(b.created_at) ?? b.id) -
          (timeOf(a.updated_at) ?? timeOf(a.created_at) ?? a.id),
        )[0];
      const teamUsers = currentTeam?.users ?? [];
      const teammates = teamUsers
        .map((user) => user.login?.trim())
        .filter((login): login is string => Boolean(login && login !== student.login)) ?? [];
      const teamMembers = teamUsers
        .flatMap((user): StudentRef[] => {
          if (user.login === student.login || user.id === student.id) return [];
          const teammate = students.get(user.id) ?? studentsByLogin.get(user.login.toLowerCase());
          return teammate ? [teammate] : [];
        })
        .filter((member, index, all) => all.findIndex((row) => row.id === member.id) === index);
      return [{
        id: String(row.id), student, projectId: project.id, projectName: project.name,
        projectSlug: project.slug, rank: project.rank, xp: project.xp, finalMark: mark,
        markedAt: new Date(markedAt).toISOString(), occurrence,
        teammates: [...new Set(teammates)],
        teamMembers,
        achievements: achievementKinds(project, mark, occurrence, teammates),
      }];
    })
    .sort((a, b) => Date.parse(b.markedAt) - Date.parse(a.markedAt));
}

function achievementKinds(
  project: Pick<ProjectMeta, "id" | "name" | "slug">,
  mark: number,
  occurrence: number,
  teammates: readonly string[],
): AchievementKind[] {
  const kinds: AchievementKind[] = [];
  if (project.id === 1314 || project.slug === "libft") kinds.push("first_core");
  if (isExamProject(project)) kinds.push("exam");
  if (mark >= 125) kinds.push("perfect");
  if (teammates.length > 0) kinds.push("team");
  if (occurrence > 0) kinds.push("persistence");
  else kinds.push("first_try");
  return kinds;
}

function hasTruant(row: FtScaleTeam): boolean {
  return Boolean(row.truant && typeof row.truant === "object" && Object.keys(row.truant).length > 0);
}

function completedScaleTeams(rows: readonly FtScaleTeam[]): FtScaleTeam[] {
  const byId = new Map<number, FtScaleTeam>();
  for (const row of rows) {
    if (timeOf(row.filled_at) === null || hasTruant(row)) continue;
    const previous = byId.get(row.id);
    const at = timeOf(row.filled_at) ?? 0;
    const previousAt = timeOf(previous?.filled_at) ?? 0;
    if (!previous || at >= previousAt) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export function buildWeeklyHighlights(
  markedRows: readonly FtProjectsUser[],
  scaleTeams: readonly FtScaleTeam[],
  now: Date,
  timeZone: string,
  resolveProject?: (project: FtProjectRef) => ProjectMeta,
): WeeklyHighlights {
  const weekStart = campusWeekStart(now, timeZone);
  const previousStart = new Date(weekStart.getTime() - WEEK_MS);
  const elapsed = now.getTime() - weekStart.getTime();
  const previousEnd = previousStart.getTime() + elapsed;
  const realMarked = markedRows.filter(isRealAttempt);
  const validated = realMarked.filter((row) => row["validated?"] === true);
  const completedEvals = completedScaleTeams(scaleTeams).filter(
    (row) => (timeOf(row.filled_at) ?? Infinity) <= now.getTime(),
  );
  const currentValidated = validated.filter((row) => (timeOf(row.marked_at) ?? 0) >= weekStart.getTime());
  const previousValidated = validated.filter((row) => {
    const at = timeOf(row.marked_at) ?? 0;
    return at >= previousStart.getTime() && at <= previousEnd;
  });
  const currentEvals = completedEvals.filter((row) => {
    const at = timeOf(row.filled_at) ?? 0;
    return at >= weekStart.getTime() && at <= now.getTime();
  });
  const previousEvals = completedEvals.filter((row) => {
    const at = timeOf(row.filled_at) ?? 0;
    return at >= previousStart.getTime() && at <= previousEnd;
  });
  const namedShippers = new Set(currentValidated.map((row) => row.user?.id).filter(Number.isFinite));
  const currentExams = currentValidated.filter((row) => isExamProject(row.project)).length;
  const previousExams = previousValidated.filter((row) => isExamProject(row.project)).length;

  const projectCounts = new Map<string, { name: string; count: number }>();
  for (const row of currentValidated) {
    if (!row.project) continue;
    const meta = resolveProject ? resolveProject(row.project) : null;
    const name = meta?.name || row.project.name || row.project.slug || "Unknown";
    const existing = projectCounts.get(name) ?? { name, count: 0 };
    existing.count++;
    projectCounts.set(name, existing);
  }
  let topProject: { name: string; count: number } | null = null;
  for (const item of projectCounts.values()) {
    if (!topProject || item.count > topProject.count) {
      topProject = item;
    }
  }

  return {
    current: { validations: currentValidated.length, evaluations: currentEvals.length, exams: currentExams },
    previous: { validations: previousValidated.length, evaluations: previousEvals.length, exams: previousExams },
    uniqueShippers: namedShippers.size,
    topProject,
  };
}

function buildConnect(
  waitingRows: readonly FtProjectsUser[],
  students: ReadonlyMap<number, StudentRef>,
  resolveProject: (project: FtProjectRef) => ProjectMeta,
  now: Date,
  people: {
    searchingRows?: readonly FtProjectsUser[];
    teamUpComplete?: boolean;
    projectCatalogueComplete?: boolean;
    futureScaleTeams?: readonly FtScaleTeam[];
    futureEvaluationsComplete?: boolean;
    scaleTeams?: readonly FtScaleTeam[];
    evaluationsComplete?: boolean;
    timeZone?: string;
  } = {},
): ConnectState {
  const waiting = latestByStudentProject(waitingRows);
  const needsEvaluator = buildNeedsEvaluator(
    waiting,
    people.futureScaleTeams ?? [],
    students,
    resolveProject,
    now,
    people.futureEvaluationsComplete ?? false,
  );
  const teamUp = buildTeamUp(
    people.searchingRows ?? [],
    students,
    resolveProject,
    now,
    people.teamUpComplete ?? false,
    people.projectCatalogueComplete ?? false,
  );
  const peerContributors = buildPeerContributors(
    people.scaleTeams ?? [],
    students,
    now,
    people.timeZone ?? "Europe/Warsaw",
    people.evaluationsComplete ?? false,
  );
  const statuses = [needsEvaluator.status, teamUp.status, peerContributors.status];
  return {
    status: statuses.every((status) => status === "collecting")
      ? "collecting"
      : statuses.every((status) => status === "ready") ? "ready" : "partial",
    needsEvaluator,
    teamUp,
    peerContributors,
  };
}

function buildNeedsEvaluator(
  waiting: readonly FtProjectsUser[],
  futureScaleTeams: readonly FtScaleTeam[],
  students: ReadonlyMap<number, StudentRef>,
  resolveProject: (project: FtProjectRef) => ProjectMeta,
  now: Date,
  complete: boolean,
): NeedsEvaluatorState {
  if (!complete) {
    return {
      status: "partial",
      open: null,
      projects: [],
      requests: [],
    };
  }

  const scheduledTeams = new Set(
    futureScaleTeams
      .filter((row) => (timeOf(row.begin_at) ?? -Infinity) >= now.getTime())
      .map((row) => row.team?.id)
      .filter((id): id is number => Number.isFinite(id)),
  );
  const joinable = waiting.filter((row) => Number.isFinite(row.current_team_id));
  const openRows = joinable.filter((row) => {
    if (scheduledTeams.has(row.current_team_id as number)) return false;
    const project = resolveProject(row.project);
    if (isExamProject(project) || isWorkExperienceProject(project)) return false;
    return true;
  });
  const missingTeamIds = waiting.length - joinable.length;
  const projectsById = new Map<number, NeedsEvaluatorProject>();
  for (const row of openRows) {
    const project = resolveProject(row.project);
    const current = projectsById.get(project.id) ?? {
      projectId: project.id,
      projectName: project.name,
      open: 0,
    };
    current.open += 1;
    projectsById.set(project.id, current);
  }
  const projects = [...projectsById.values()]
    .sort((a, b) => b.open - a.open || a.projectName.localeCompare(b.projectName))
    .slice(0, 8);
  const requests: ConnectRequest[] = openRows
    .flatMap((row): ConnectRequest[] => {
      const student = row.user?.id ? students.get(row.user.id) : null;
      if (!student) return [];
      const project = resolveProject(row.project);
      const updatedAt = timeOf(row.updated_at) ?? timeOf(row.created_at) ?? now.getTime();
      return [{
        id: String(row.id),
        student,
        projectId: project.id,
        projectName: project.name,
        rank: project.rank,
        updatedAt: new Date(updatedAt).toISOString(),
      }];
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.student.login.localeCompare(b.student.login))
    .slice(0, 8);

  return {
    status: missingTeamIds > 0 ? "partial" : "ready",
    open: openRows.length,
    projects,
    requests,
  };
}

function buildTeamUp(
  rows: readonly FtProjectsUser[],
  students: ReadonlyMap<number, StudentRef>,
  resolveProject: (project: FtProjectRef) => ProjectMeta,
  now: Date,
  feedComplete: boolean,
  catalogueComplete: boolean,
): TeamUpState {
  const latest = latestByStudentProject(rows).filter((row) => row.status === "searching_a_group");
  const knownTeamRows: Array<{ row: FtProjectsUser; project: ProjectMeta }> = [];
  let unknownProjects = 0;
  for (const row of latest) {
    const project = resolveProject(row.project);
    if (project.teamProject === true) knownTeamRows.push({ row, project });
    else if (project.teamProject === null) unknownProjects += 1;
  }
  const oldestNamedAt = now.getTime() - 30 * DAY_MS;
  const requests = knownTeamRows
    .flatMap(({ row, project }) => {
      const student = row.user?.id ? students.get(row.user.id) : null;
      const updatedAt = timeOf(row.updated_at) ?? timeOf(row.created_at);
      if (!student || updatedAt === null || updatedAt < oldestNamedAt || updatedAt > now.getTime()) return [];
      return [{
        id: String(row.id),
        student,
        projectId: project.id,
        projectName: project.name,
        rank: project.rank,
        updatedAt: new Date(updatedAt).toISOString(),
      }];
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.student.login.localeCompare(b.student.login))
    .slice(0, 8);
  const complete = feedComplete && catalogueComplete && unknownProjects === 0;
  return {
    status: complete ? "ready" : "partial",
    searching: knownTeamRows.length,
    requests,
  };
}

function buildPeerContributors(
  rows: readonly FtScaleTeam[],
  students: ReadonlyMap<number, StudentRef>,
  now: Date,
  timeZone: string,
  complete: boolean,
): PeerContributionState {
  const weekStart = campusWeekStart(now, timeZone);
  const completed = completedScaleTeams(rows).filter((row) => {
    const at = timeOf(row.filled_at);
    return at !== null && at >= weekStart.getTime() && at <= now.getTime();
  });
  const named = new Map<number, { student: StudentRef; count: number; latestAt: number }>();
  for (const row of completed) {
    const corrector = row.corrector;
    if (!corrector || typeof corrector !== "object" || !Number.isFinite(corrector.id)) continue;
    const student = students.get(corrector.id);
    const filledAt = timeOf(row.filled_at);
    if (!student || filledAt === null) continue;
    const previous = named.get(student.id);
    named.set(student.id, {
      student,
      count: (previous?.count ?? 0) + 1,
      latestAt: Math.max(previous?.latestAt ?? 0, filledAt),
    });
  }
  const evaluators = [...named.values()]
    .map((row) => ({
      student: row.student,
      completedEvaluations: row.count,
      latestAt: new Date(row.latestAt).toISOString(),
    }))
    .sort((a, b) =>
      b.completedEvaluations - a.completedEvaluations ||
      Date.parse(b.latestAt) - Date.parse(a.latestAt) ||
      a.student.login.localeCompare(b.student.login),
    );
  return {
    status: complete ? "ready" : "partial",
    totalCompleted: completed.length,
    evaluators,
  };
}

interface Interval { start: number; end: number }

function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

export function parseHost(host: string): Pick<WorkstationStat, "cluster" | "row" | "seat"> {
  const match = /^c(\d+)r(\d+)s(\d+)$/i.exec(host.trim());
  return match
    ? { cluster: Number(match[1]), row: Number(match[2]), seat: Number(match[3]) }
    : { cluster: null, row: null, seat: null };
}

export function buildCampusActivity(
  presence: PresenceBundle,
  roster: readonly FtCursusUser[] = [],
  now = new Date(presence.observedAt),
  knownPeople: readonly CampusPersonTime[] = [],
  profileStudents: readonly StudentRef[] = [],
): CampusActivityState {
  const weekStart = Date.parse(presence.weekStart);
  const nowMs = now.getTime();
  const names = new Map<number, StudentRef>();
  for (const person of knownPeople) {
    names.set(person.id, {
      id: person.id,
      login: person.login,
      displayName: person.displayName,
      image: person.image,
      level: 0,
    });
  }
  for (const row of roster) {
    const ref = studentRef(row);
    if (ref) names.set(ref.id, ref);
  }
  for (const ref of profileStudents) names.set(ref.id, ref);
  const validRows = presence.locations.flatMap((row): Array<{ row: FtLocation; interval: Interval; userId: number; login: string }> => {
    const begin = timeOf(row.begin_at);
    const end = timeOf(row.end_at) ?? nowMs;
    const userId = row.user?.id;
    const login = row.user?.login;
    if (begin === null || !Number.isFinite(userId) || !login) return [];
    const interval = { start: Math.max(begin, weekStart), end: Math.min(end, nowMs) };
    return interval.end > interval.start ? [{ row, interval, userId: userId as number, login }] : [];
  });

  const byUser = new Map<number, { login: string; intervals: Interval[] }>();
  const byHost = new Map<string, { intervals: Interval[]; users: Set<number>; active: boolean }>();
  for (const entry of validRows) {
    const user = byUser.get(entry.userId) ?? { login: entry.login, intervals: [] };
    user.intervals.push(entry.interval);
    byUser.set(entry.userId, user);
    const host = byHost.get(entry.row.host) ?? { intervals: [], users: new Set<number>(), active: false };
    host.intervals.push(entry.interval);
    host.users.add(entry.userId);
    if (!entry.row.end_at && entry.interval.end === nowMs) host.active = true;
    byHost.set(entry.row.host, host);
  }

  const people = [...byUser.entries()].map(([id, value]) => {
    const minutes = mergeIntervals(value.intervals).reduce((sum, row) => sum + (row.end - row.start) / 60_000, 0);
    const ref = names.get(id);
    return { id, login: value.login, displayName: ref?.displayName ?? value.login, image: ref?.image ?? null, minutes: Math.round(minutes) };
  });
  people.sort((a, b) => b.minutes - a.minutes || a.login.localeCompare(b.login));

  const workstations = [...byHost.entries()].map(([host, value]) => ({
    host,
    ...parseHost(host),
    active: value.active,
    minutes: Math.round(value.intervals.reduce((sum, row) => sum + (row.end - row.start) / 60_000, 0)),
    uniqueUsers: value.users.size,
  })).sort((a, b) => b.minutes - a.minutes || a.host.localeCompare(b.host));

  const sweep: Array<[number, number]> = [];
  for (const value of byUser.values()) {
    for (const interval of mergeIntervals(value.intervals)) {
      sweep.push([interval.start, 1], [interval.end, -1]);
    }
  }
  sweep.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let occupancy = 0;
  let peak = 0;
  for (const [, delta] of sweep) {
    occupancy += delta;
    peak = Math.max(peak, occupancy);
  }
  const currentRows = presence.activeLocationsComplete
    ? presence.activeLocations.filter((row) => row.end_at === null && (timeOf(row.begin_at) ?? Infinity) <= nowMs)
    : validRows.filter((entry) => !entry.row.end_at).map((entry) => entry.row);
  if (presence.activeLocationsComplete) {
    const currentHosts = new Set(currentRows.map((row) => row.host));
    for (const workstation of workstations) workstation.active = currentHosts.has(workstation.host);
  }
  const activeUsers = new Set(
    currentRows.map((row) => row.user?.id).filter((id): id is number => Number.isFinite(id)),
  );

  const activeSeatStatus = presence.activeLocationsComplete ? "live" as const : "partial" as const;
  const activeSeats: ActiveSeatIdentity[] = [];
  if (presence.activeLocationsComplete) {
    const usedHosts = new Set<string>();
    const usedStudents = new Set<number>();
    const usersByHost = new Map<string, Set<number>>();
    for (const row of presence.activeLocations) {
      if (row.end_at !== null || !Number.isFinite(row.user?.id)) continue;
      const users = usersByHost.get(row.host) ?? new Set<number>();
      users.add(row.user!.id);
      usersByHost.set(row.host, users);
    }
    const conflictedHosts = new Set(
      [...usersByHost.entries()]
        .filter(([, users]) => users.size > 1)
        .map(([host]) => host),
    );
    const candidates = [...presence.activeLocations]
      .filter((row) => row.end_at === null && !conflictedHosts.has(row.host))
      .sort((a, b) =>
        (timeOf(b.begin_at) ?? 0) - (timeOf(a.begin_at) ?? 0) || b.id - a.id,
      );
    for (const row of candidates) {
      const beganAt = timeOf(row.begin_at);
      const student = row.user?.id ? names.get(row.user.id) : null;
      const place = parseHost(row.host);
      if (
        beganAt === null || beganAt > nowMs || !student || usedHosts.has(row.host) ||
        usedStudents.has(student.id) || place.cluster === null || place.row === null || place.seat === null
      ) continue;
      usedHosts.add(row.host);
      usedStudents.add(student.id);
      activeSeats.push({
        host: row.host,
        cluster: place.cluster,
        row: place.row,
        seat: place.seat,
        student,
      });
    }
    activeSeats.sort((a, b) => a.host.localeCompare(b.host));
  }

  const coalitionMeta = new Map(presence.coalitions.map((row) => [row.id, row]));
  const latestMembership = new Map<number, { coalitionId: number; at: number; points: number | null }>();
  for (const row of presence.coalitionMemberships) {
    if (!coalitionMeta.has(row.coalition_id)) continue;
    const at = timeOf(row.updated_at) ?? timeOf(row.created_at) ?? 0;
    const previous = latestMembership.get(row.user_id);
    if (!previous || at >= previous.at) {
      latestMembership.set(row.user_id, {
        coalitionId: row.coalition_id,
        at,
        points: Number.isFinite(row.this_year_score) ? Math.round(row.this_year_score ?? 0) : null,
      });
    }
  }
  const currentMemberships = [...latestMembership.values()];
  const coalitionBuckets = new Map<number, { minutes: number; members: Set<number> }>();
  for (const person of people) {
    const membership = latestMembership.get(person.id);
    if (!membership || !coalitionMeta.has(membership.coalitionId)) continue;
    const bucket = coalitionBuckets.get(membership.coalitionId) ?? { minutes: 0, members: new Set<number>() };
    bucket.minutes += person.minutes;
    bucket.members.add(person.id);
    coalitionBuckets.set(membership.coalitionId, bucket);
  }
  const topPointsByCoalition = new Map<number, CoalitionPointsContributor>();
  for (const [studentId, membership] of latestMembership) {
    const student = names.get(studentId);
    if (
      !student || !coalitionMeta.has(membership.coalitionId) ||
      membership.points === null || membership.points <= 0
    ) continue;
    const contributor: CoalitionPointsContributor = {
      student: {
        id: student.id,
        login: student.login,
        displayName: student.displayName,
        image: student.image,
      },
      points: membership.points,
    };
    const previous = topPointsByCoalition.get(membership.coalitionId);
    if (
      !previous || contributor.points > previous.points ||
      (contributor.points === previous.points && contributor.student.login.localeCompare(previous.student.login) < 0)
    ) topPointsByCoalition.set(membership.coalitionId, contributor);
  }

  const topTimeByCoalition = new Map<number, CoalitionTimeContributor>();
  for (const person of people) {
    const membership = latestMembership.get(person.id);
    if (!membership || !coalitionMeta.has(membership.coalitionId) || person.minutes <= 0) continue;
    const previous = topTimeByCoalition.get(membership.coalitionId);
    if (!previous || person.minutes > previous.minutes) {
      topTimeByCoalition.set(membership.coalitionId, {
        student: {
          id: person.id,
          login: person.login,
          displayName: person.displayName,
          image: person.image,
        },
        minutes: Math.round(person.minutes),
      });
    }
  }

  const coalitionIds = new Set([
    ...coalitionMeta.keys(),
    ...coalitionBuckets.keys(),
    ...topPointsByCoalition.keys(),
    ...topTimeByCoalition.keys(),
  ]);
  const coalitions: CoalitionTime[] = [...coalitionIds].map((id) => {
    const value = coalitionBuckets.get(id) ?? { minutes: 0, members: new Set<number>() };
    const meta = coalitionMeta.get(id);
    const topPoints = topPointsByCoalition.get(id) ?? null;
    const topTime = topTimeByCoalition.get(id) ?? null;
    return {
      id,
      name: meta?.name ?? `Coalition ${id}`,
      color: meta?.color || "#a98bff",
      score: Number.isFinite(meta?.score) ? meta?.score ?? null : null,
      minutes: Math.round(value.minutes),
      activeMembers: value.members.size,
      minutesPerActiveMember: value.members.size ? Math.round(value.minutes / value.members.size) : 0,
      topPointsContributor: topPoints,
      topTimeContributor: topTime,
    };
  });
  coalitions.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));

  const hasLocationError = !presence.locationsComplete || !presence.activeLocationsComplete;
  const hasCoalitionError = !presence.coalitionsComplete;
  const coalitionCoverageMissing = people.some((person) => {
    const membership = latestMembership.get(person.id);
    return !membership || !coalitionMeta.has(membership.coalitionId);
  });
  return {
    status: validRows.length === 0
      ? "collecting"
      : hasLocationError || hasCoalitionError || coalitionCoverageMissing
        ? "partial"
        : "ready",
    currentOccupancy: activeUsers.size,
    peakOccupancy: peak,
    totalMinutes: people.reduce((sum, row) => sum + row.minutes, 0),
    topStudents: people.slice(0, 5),
    workstations,
    coalitions,
    coalitionScoreStatus: presence.coalitionsComplete && coalitions.length > 0 && coalitions.every((row) => row.score !== null)
      ? "ready"
      : coalitions.some((row) => row.score !== null) ? "partial" : "collecting",
    coalitionContributorStatus: !presence.coalitionsComplete
      ? coalitions.length > 0 ? "partial" : "collecting"
      : currentMemberships.length === 0
        ? "collecting"
        : currentMemberships.every((row) => row.points !== null)
          ? "ready"
          : currentMemberships.some((row) => row.points !== null) ? "partial" : "collecting",
    activeSeatStatus,
    activeSeats,
    note: "Cluster time measures logged workstation sessions, not physical presence.",
  };
}

export function transform(
  raw: RawBundle,
  now = new Date(),
): Snapshot {
  const nowMs = now.getTime();
  const timeZone = raw.campus?.time_zone || "Europe/Warsaw";
  const resolveProject = projectResolver(raw);
  const students = new Map<number, StudentRef>();
  for (const row of raw.roster) {
    const ref = studentRef(row, raw.profileCache.entries[String(row.user?.id)]);
    if (ref) students.set(ref.id, ref);
  }
  const studentsByLogin = new Map(
    [...students.values()].map((student) => [student.login.toLowerCase(), student]),
  );
  const windowStart = nowMs - raw.windowDays * DAY_MS;
  const allCelebrations = buildCelebrations(
    raw.marked,
    students,
    studentsByLogin,
    resolveProject,
    windowStart,
  );
  const weekly = buildWeeklyHighlights(raw.marked, raw.scaleTeams, now, timeZone, resolveProject);
  const connect = buildConnect(
    raw.waitingForCorrection,
    students,
    resolveProject,
    now,
    {
      searchingRows: raw.searchingForGroup,
      teamUpComplete: raw.teamUpComplete,
      projectCatalogueComplete: raw.projects.length > 0,
      futureScaleTeams: raw.futureScaleTeams,
      futureEvaluationsComplete: raw.waitingComplete && raw.futureEvaluationsComplete,
      scaleTeams: raw.scaleTeams,
      evaluationsComplete: raw.evaluationsComplete,
      timeZone,
    },
  );
  const builtCampusActivity = buildCampusActivity(
    raw.presence,
    raw.roster,
    now,
    [],
    [...students.values()],
  );
  const snapshot: Snapshot = {
    generatedAt: now.toISOString(),
    buildMs: Math.max(0, nowMs - Date.parse(raw.startedAt)),
    apiCalls: raw.apiCalls,
    diagnostics: dedupeDiagnostics(raw.diagnostics),
    campus: {
      id: raw.campus?.id ?? raw.campusId,
      name: raw.campus?.name ?? (raw.campusId === CAMPUS_ID ? "Warsaw" : `Campus ${raw.campusId}`),
      timeZone,
    },
    cursus: { id: raw.cursusId, name: raw.cursusId === 21 ? "42cursus" : `Cursus ${raw.cursusId}` },
    windowDays: raw.windowDays,
    weekly,
    celebrations: allCelebrations,
    connect,
    campusActivity: builtCampusActivity,
  };
  return snapshot;
}
