/**
 * Raw shapes returned by the 42 Intra API (v2).
 *
 * Two things to know before editing:
 *
 * 1. Several boolean fields have a literal `?` in the JSON key (`validated?`,
 *    `staff?`, `active?`, ...). They are typed as quoted properties here and
 *    must be read with bracket notation: `row["validated?"]`.
 *
 * 2. The API is generous but inconsistent: index endpoints return leaner
 *    objects than show endpoints, and nested objects vary by parent. Anything
 *    we are not certain is always present is marked optional so a missing
 *    field degrades into `undefined` rather than a runtime crash. The pipeline
 *    is expected to defend itself.
 */

interface FtImageVersions {
  large?: string | null;
  medium?: string | null;
  small?: string | null;
  micro?: string | null;
}

interface FtImage {
  link?: string | null;
  versions?: FtImageVersions;
}

/** The lean `{id, login, url}` shape nested inside most collections. */
export interface FtUserRef {
  id: number;
  login: string;
  url?: string;
  /** Present on the fatter nested users (e.g. inside cursus_users). */
  displayname?: string;
  usual_full_name?: string | null;
  first_name?: string;
  last_name?: string;
  image?: FtImage | null;
  pool_month?: string | null;
  pool_year?: string | null;
  kind?: string;
  "staff?"?: boolean;
  "active?"?: boolean;
  "alumni?"?: boolean;
  wallet?: number;
  correction_point?: number;
}

export interface FtCampus {
  id: number;
  name: string;
  time_zone: string;
  language?: { id: number; name: string; identifier: string };
  users_count?: number;
  vogsphere_id?: number | null;
  country?: string;
  address?: string;
  zip?: string;
  city?: string;
  website?: string;
  facebook?: string;
  twitter?: string;
  active?: boolean;
  public?: boolean;
  email_extension?: string;
  default_hidden_phone?: boolean;
}

interface FtCursus {
  id: number;
  created_at?: string;
  name: string;
  slug: string;
  kind?: string;
}

interface FtSkill {
  id: number;
  name: string;
  level: number;
}

/**
 * GET /v2/cursus_users — the single call that gives level AND user together.
 * `/v2/users` and `/v2/campus/:id/users` are lean and carry no level at all.
 */
export interface FtCursusUser {
  id: number;
  begin_at: string | null;
  end_at: string | null;
  grade: string | null;
  level: number;
  skills?: FtSkill[];
  cursus_id: number;
  created_at?: string;
  updated_at?: string;
  user?: FtUserRef | null;
  cursus?: FtCursus;
}

/** GET /v2/projects and GET /v2/cursus/:id/projects. */
export interface FtProject {
  id: number;
  name: string;
  slug: string;
  parent?: { id: number; name: string; slug: string } | null;
  children?: Array<{ id: number; name: string; slug: string }>;
  /** XP the project is worth. Only present on some payload variants. */
  difficulty?: number | null;
  exam?: boolean;
  cursus?: FtCursus[];
  campus?: Array<{ id: number; name: string }>;
  /** Present on /v2/cursus/:id/projects. */
  project_sessions?: Array<{
    id: number;
    difficulty?: number | null;
    estimate_time?: number | string | null;
    campus_id?: number | null;
    cursus_id?: number | null;
    /** Explicitly false for projects that require a team. */
    solo?: boolean | null;
    min_people?: number | null;
    max_people?: number | null;
  }>;
}

export interface FtProjectRef {
  id: number;
  name: string;
  slug: string;
  parent_id?: number | null;
}

interface FtTeamUser {
  id: number;
  login: string;
  url?: string;
  leader?: boolean;
  occurrence?: number;
  "validated?"?: boolean | null;
  projects_user_id?: number;
}

interface FtTeam {
  id: number;
  name?: string;
  url?: string;
  final_mark?: number | null;
  project_id?: number;
  created_at?: string;
  updated_at?: string;
  status?: string;
  terminating_at?: string | null;
  users?: FtTeamUser[];
  "locked?"?: boolean;
  "validated?"?: boolean | null;
  "closed?"?: boolean;
  repo_url?: string | null;
  locked_at?: string | null;
  closed_at?: string | null;
  project_session_id?: number;
}

/**
 * `parent` rows are umbrella containers (e.g. the "CPP Module" wrapper that
 * sits above CPP Module 00..09). They carry no real mark and counting them
 * double-counts every module underneath. Always filter them out.
 */
type FtProjectsUserStatus =
  | "creating_group"
  | "searching_a_group"
  | "in_progress"
  | "waiting_for_correction"
  | "finished"
  | "parent";

export interface FtProjectsUser {
  id: number;
  occurrence: number;
  final_mark: number | null;
  status: FtProjectsUserStatus | string;
  "validated?": boolean | null;
  current_team_id?: number | null;
  project: FtProjectRef;
  cursus_ids?: number[];
  user?: FtUserRef | null;
  teams?: FtTeam[];
  created_at?: string;
  updated_at?: string;
  marked_at?: string | null;
  marked?: boolean;
  retriable_at?: string | null;
}

export interface FtScaleTeam {
  id: number;
  scale_id?: number;
  comment?: string | null;
  created_at?: string;
  updated_at?: string;
  feedback?: string | null;
  final_mark: number | null;
  flag?: { id: number; name: string; positive: boolean; icon?: string };
  begin_at: string;
  correcteds?: FtUserRef[];
  corrector?: FtUserRef | string | null;
  truant?: FtUserRef | Record<string, never>;
  filled_at?: string | null;
  team?: FtTeam & { project_id?: number };
  scale?: { id: number; correction_number?: number; is_primary?: boolean };
}

/** GET /v2/campus/:campus_id/locations. Warsaw encodes geometry in `host`. */
export interface FtLocation {
  id: number;
  begin_at: string;
  end_at: string | null;
  primary?: boolean;
  floor?: number | string | null;
  row?: number | string | null;
  post?: number | string | null;
  host: string;
  campus_id: number;
  user?: FtUserRef | null;
}

export interface FtCoalitionUser {
  id: number;
  coalition_id: number;
  user_id: number;
  /** Individual contribution exposed by the coalition membership endpoint. */
  this_year_score?: number | null;
  this_year_score_updated_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FtCoalition {
  id: number;
  name: string;
  slug: string;
  image_url?: string | null;
  color?: string | null;
  score?: number;
  user_id?: number;
  bloc_id?: number;
}

export interface FtBloc {
  id: number;
  campus_id: number;
  cursus_id: number;
  squad_size?: number;
  created_at?: string;
  updated_at?: string;
  coalitions?: FtCoalition[];
}

/** OAuth2 client_credentials grant response. There is no refresh token. */
export interface FtTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  created_at?: number;
}
