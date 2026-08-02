/** The single server-built payload rendered by every TV scene. */

export type DashboardStatus = "ERROR" | "STALE" | "PARTIAL" | "LIVE";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type DiagnosticScope =
  | "pipeline"
  | "cache"
  | "campus"
  | "roster"
  | "profiles"
  | "projects"
  | "team_up"
  | "evaluations"
  | "locations"
  | "coalitions";

export interface Snapshot {
  generatedAt: string;
  buildMs: number;
  apiCalls: number;
  diagnostics: DataDiagnostic[];
  campus: CampusInfo;
  cursus: { id: number; name: string };
  windowDays: number;
  weekly: WeeklyHighlights;
  celebrations: Celebration[];
  connect: ConnectState;
  campusActivity: CampusActivityState;
}

export interface DataDiagnostic {
  code: string;
  scope: DiagnosticScope;
  severity: DiagnosticSeverity;
  message: string;
  fallbackActive: boolean;
  observedAt: string;
}

interface CampusInfo {
  id: number;
  name: string;
  timeZone: string;
}

interface WeekTotals {
  validations: number;
  evaluations: number;
  exams: number;
}

export interface WeeklyHighlights {
  current: WeekTotals;
  previous: WeekTotals;
  uniqueShippers: number;
  topProject?: { name: string; count: number } | null;
}

export interface StudentRef {
  id: number;
  login: string;
  displayName: string;
  image: string | null;
  level: number;
}

export interface Celebration {
  id: string;
  student: StudentRef;
  projectId: number;
  projectName: string;
  projectSlug: string;
  /** Derived from the checked-in Common Core map. */
  rank: number | null;
  xp: number;
  finalMark: number;
  markedAt: string;
  occurrence: number;
  teammates: string[];
  /** Active-roster teammates that can be rendered as people, not invented cards. */
  teamMembers: StudentRef[];
  achievements: AchievementKind[];
}

export type AchievementKind =
  | "first_core"
  | "exam"
  | "perfect"
  | "first_try"
  | "team"
  | "persistence";

type ConnectStatus = "collecting" | "partial" | "ready";
export type PeopleSectionStatus = "collecting" | "partial" | "ready";

export interface ConnectRequest {
  id: string;
  student: StudentRef;
  projectId: number;
  projectName: string;
  rank: number | null;
  updatedAt: string;
}

export interface NeedsEvaluatorProject {
  projectId: number;
  projectName: string;
  open: number;
}

export interface NeedsEvaluatorState {
  status: PeopleSectionStatus;
  open: number | null;
  projects: NeedsEvaluatorProject[];
  requests: ConnectRequest[];
}

export interface TeamUpState {
  status: PeopleSectionStatus;
  searching: number;
  requests: ConnectRequest[];
}

export interface PeerContributor {
  student: StudentRef;
  completedEvaluations: number;
  latestAt: string;
}

export interface PeerContributionState {
  status: PeopleSectionStatus;
  totalCompleted: number;
  evaluators: PeerContributor[];
}

export interface ConnectState {
  status: ConnectStatus;
  needsEvaluator: NeedsEvaluatorState;
  teamUp: TeamUpState;
  peerContributors: PeerContributionState;
}

type CampusActivityStatus = "collecting" | "partial" | "ready";

export interface CampusPersonTime {
  id: number;
  login: string;
  displayName: string;
  image: string | null;
  minutes: number;
}

export interface WorkstationStat {
  host: string;
  cluster: number | null;
  row: number | null;
  seat: number | null;
  active: boolean;
  minutes: number;
  uniqueUsers: number;
}

export interface CoalitionTime {
  id: number;
  name: string;
  color: string;
  /** Official cumulative score returned by the current coalition bloc. */
  score: number | null;
  minutes: number;
  activeMembers: number;
  minutesPerActiveMember: number;
  topPointsContributor: CoalitionPointsContributor | null;
  topTimeContributor: CoalitionTimeContributor | null;
}

export interface CoalitionPointsContributor {
  student: Pick<StudentRef, "id" | "login" | "displayName" | "image">;
  points: number;
}

export interface CoalitionTimeContributor {
  student: Pick<StudentRef, "id" | "login" | "displayName" | "image">;
  minutes: number;
}

export interface ActiveSeatIdentity {
  host: string;
  cluster: number;
  row: number;
  seat: number;
  student: StudentRef;
}

type ActiveSeatStatus = "live" | "partial";

export interface CampusActivityState {
  status: CampusActivityStatus;
  currentOccupancy: number;
  peakOccupancy: number;
  totalMinutes: number;
  topStudents: CampusPersonTime[];
  workstations: WorkstationStat[];
  coalitions: CoalitionTime[];
  coalitionScoreStatus: PeopleSectionStatus;
  coalitionContributorStatus: PeopleSectionStatus;
  activeSeatStatus: ActiveSeatStatus;
  activeSeats: ActiveSeatIdentity[];
  note: string;
}

export interface SnapshotResponse {
  ok: boolean;
  snapshot: Snapshot | null;
  nextRefreshIn: number;
  stale: boolean;
  error?: string;
}
