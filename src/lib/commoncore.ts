/**
 * Common Core (cursus 21) project metadata.
 *
 * The 42 API exposes `difficulty` (= XP) on /v2/projects, but it does NOT expose
 * the rank a project belongs to — that lives only in the Holy Graph UI. We keep a
 * static, reviewable map here so project ranks stay consistent across scenes.
 *
 * Project ids and XP values are cross-checked against public /v2/projects dumps.
 * `resolveRank()` degrades gracefully: an unknown project id falls back to a
 * slug match, then to null, and the UI just files it under "Outer Core".
 */

export const CURSUS_ID = 21;
export const CAMPUS_ID = 67; // 42 Warsaw

interface CoreProject {
  id: number;
  name: string;
  slug: string;
  rank: number;
  xp: number;
  /** Projects the student picks between — only one is needed to advance. */
  alternativeOf?: string;
}

const COMMON_CORE: CoreProject[] = [
  { id: 1314, name: "Libft", slug: "libft", rank: 0, xp: 462 },

  { id: 1316, name: "ft_printf", slug: "ft_printf", rank: 1, xp: 882 },
  { id: 1327, name: "get_next_line", slug: "get_next_line", rank: 1, xp: 882 },
  { id: 1994, name: "Born2beroot", slug: "born2beroot", rank: 1, xp: 577 },

  { id: 1320, name: "Exam Rank 02", slug: "exam-rank-02", rank: 2, xp: 0 },
  { id: 1471, name: "push_swap", slug: "push_swap", rank: 2, xp: 1855 },
  { id: 2005, name: "minitalk", slug: "minitalk", rank: 2, xp: 1142, alternativeOf: "ipc" },
  { id: 2004, name: "pipex", slug: "pipex", rank: 2, xp: 1142, alternativeOf: "ipc" },
  { id: 2009, name: "so_long", slug: "so_long", rank: 2, xp: 1000, alternativeOf: "graphics" },
  { id: 2008, name: "FdF", slug: "fdf", rank: 2, xp: 1000, alternativeOf: "graphics" },
  { id: 1476, name: "fract-ol", slug: "fract-ol", rank: 2, xp: 1000, alternativeOf: "graphics" },

  { id: 1321, name: "Exam Rank 03", slug: "exam-rank-03", rank: 3, xp: 0 },
  { id: 1334, name: "Philosophers", slug: "philosophers", rank: 3, xp: 3360 },
  { id: 1331, name: "minishell", slug: "minishell", rank: 3, xp: 2814 },

  { id: 1322, name: "Exam Rank 04", slug: "exam-rank-04", rank: 4, xp: 0 },
  { id: 2007, name: "NetPractice", slug: "netpractice", rank: 4, xp: 3160 },
  { id: 1326, name: "cub3d", slug: "cub3d", rank: 4, xp: 5775, alternativeOf: "raycaster" },
  { id: 1315, name: "miniRT", slug: "minirt", rank: 4, xp: 5775, alternativeOf: "raycaster" },
  { id: 1338, name: "CPP Module 00", slug: "cpp-module-00", rank: 4, xp: 0 },
  { id: 1339, name: "CPP Module 01", slug: "cpp-module-01", rank: 4, xp: 0 },
  { id: 1340, name: "CPP Module 02", slug: "cpp-module-02", rank: 4, xp: 0 },
  { id: 1341, name: "CPP Module 03", slug: "cpp-module-03", rank: 4, xp: 0 },
  { id: 1342, name: "CPP Module 04", slug: "cpp-module-04", rank: 4, xp: 9660 },

  { id: 1323, name: "Exam Rank 05", slug: "exam-rank-05", rank: 5, xp: 0 },
  { id: 1983, name: "Inception", slug: "inception", rank: 5, xp: 10042 },
  { id: 1343, name: "CPP Module 05", slug: "cpp-module-05", rank: 5, xp: 0 },
  { id: 1344, name: "CPP Module 06", slug: "cpp-module-06", rank: 5, xp: 0 },
  { id: 1345, name: "CPP Module 07", slug: "cpp-module-07", rank: 5, xp: 0 },
  { id: 1346, name: "CPP Module 08", slug: "cpp-module-08", rank: 5, xp: 0 },
  { id: 2309, name: "CPP Module 09", slug: "cpp-module-09", rank: 5, xp: 10042 },
  { id: 1332, name: "webserv", slug: "webserv", rank: 5, xp: 21630, alternativeOf: "network" },
  { id: 1336, name: "ft_irc", slug: "ft_irc", rank: 5, xp: 21630, alternativeOf: "network" },

  { id: 1324, name: "Exam Rank 06", slug: "exam-rank-06", rank: 6, xp: 0 },
  { id: 1337, name: "ft_transcendence", slug: "ft_transcendence", rank: 6, xp: 24360 },
];

const BY_ID = new Map(COMMON_CORE.map((p) => [p.id, p]));
const BY_SLUG = new Map(COMMON_CORE.map((p) => [p.slug, p]));
const EXAM_PROJECT_IDS = new Set(
  COMMON_CORE.filter((project) => project.slug.startsWith("exam-rank-")).map(
    (project) => project.id,
  ),
);

type ExamProjectRef = {
  id?: number;
  name?: string | null;
  slug?: string | null;
};

/** Keep the exam/project split consistent across aggregate counts and cards. */
export function isExamProject(project: ExamProjectRef): boolean {
  if (project.id !== undefined && EXAM_PROJECT_IDS.has(project.id)) return true;
  return /exam[-_ ]?rank/i.test(`${project.slug ?? ""} ${project.name ?? ""}`);
}

export function isWorkExperienceProject(project: { name?: string | null; slug?: string | null }): boolean {
  const text = `${project.slug ?? ""} ${project.name ?? ""}`;
  return /work[-_ ]?experience|internship|stage|contract|experience[-_ ]?pro/i.test(text);
}

export function coreProject(id: number, slug?: string): CoreProject | null {
  return BY_ID.get(id) ?? (slug ? BY_SLUG.get(slug) ?? null : null);
}

export const RANK_LABELS = [
  "Rank 00 — Foundations",
  "Rank 01 — Toolbox",
  "Rank 02 — Algorithms",
  "Rank 03 — Concurrency",
  "Rank 04 — Systems",
  "Rank 05 — Networks",
  "Rank 06 — Capstone",
];
