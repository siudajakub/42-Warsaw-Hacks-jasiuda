import type { Celebration, Snapshot, StudentRef } from "@/lib/contract";

function student(seed: number, index: number): StudentRef {
  const id = seed * 100 + index;
  return {
    id,
    login: `student${id}`,
    displayName: `Student ${id}`,
    image: `https://example.invalid/avatar-${id}.png`,
    level: 1 + index / 10,
  };
}

export function makeSnapshotFixture(
  seed = 1,
  now = new Date("2026-07-30T12:00:00Z"),
): Snapshot {
  const people = Array.from({ length: 12 }, (_, index) => student(seed, index + 1));
  const projects = [
    { projectId: 1314, projectName: "Libft", projectSlug: "libft", rank: 0 },
    { projectId: 1327, projectName: "get_next_line", projectSlug: "get_next_line", rank: 1 },
    { projectId: 1471, projectName: "push_swap", projectSlug: "push_swap", rank: 2 },
    { projectId: 1331, projectName: "minishell", projectSlug: "minishell", rank: 3 },
  ];
  const achievements: Celebration["achievements"][] = [
    ["first_core", "first_try"],
    ["exam"],
    ["perfect", "persistence"],
    ["team", "first_try"],
  ];
  const celebrations: Celebration[] = projects.map((project, index) => ({
    id: `fixture-${seed}-${index}`,
    student: people[index],
    ...project,
    xp: index === 1 ? 0 : 500 + index * 100,
    finalMark: index === 2 ? 125 : 100,
    markedAt: new Date(now.getTime() - index * 3_600_000).toISOString(),
    occurrence: index === 2 ? 1 : 0,
    teammates: index === 3 ? [people[4].login] : [],
    teamMembers: index === 3 ? [people[4]] : [],
    achievements: achievements[index],
  }));
  const requests = projects.map((project, index) => ({
    id: `request-${seed}-${index}`,
    student: people[index + 4],
    projectId: project.projectId,
    projectName: project.projectName,
    rank: project.rank,
    updatedAt: new Date(now.getTime() - (index + 1) * 60_000).toISOString(),
  }));

  return {
    generatedAt: now.toISOString(),
    buildMs: 10,
    apiCalls: 12,
    diagnostics: [],
    campus: { id: 67, name: "Warsaw", timeZone: "Europe/Warsaw" },
    cursus: { id: 21, name: "42cursus" },
    windowDays: 7,
    weekly: {
      current: { validations: 28, evaluations: 35, exams: 2 },
      previous: { validations: 21, evaluations: 28, exams: 1 },
      uniqueShippers: 4,
      topProject: { name: "Libft", count: 8 },
    },
    celebrations,
    connect: {
      status: "ready",
      needsEvaluator: {
        status: "ready",
        open: requests.length,
        projects: projects.map(({ projectId, projectName }) => ({ projectId, projectName, open: 1 })),
        requests,
      },
      teamUp: {
        status: "ready",
        searching: requests.length,
        requests: requests.map((request) => ({ ...request, id: `team-${request.id}` })),
      },
      peerContributors: {
        status: "ready",
        totalCompleted: 15,
        evaluators: people.slice(8).map((person, index) => ({
          student: person,
          completedEvaluations: 4 - index,
          latestAt: new Date(now.getTime() - index * 60_000).toISOString(),
        })),
      },
    },
    campusActivity: {
      status: "ready",
      currentOccupancy: 1,
      peakOccupancy: 2,
      totalMinutes: 120,
      topStudents: people.slice(0, 5).map((person, index) => ({
        id: person.id,
        login: person.login,
        displayName: person.displayName,
        image: person.image,
        minutes: 120 - index * 10,
      })),
      workstations: [{
        host: "c1r1s1",
        cluster: 1,
        row: 1,
        seat: 1,
        active: true,
        minutes: 120,
        uniqueUsers: 1,
      }],
      coalitions: [],
      coalitionScoreStatus: "ready",
      coalitionContributorStatus: "ready",
      activeSeatStatus: "live",
      activeSeats: [{
        host: "c1r1s1",
        cluster: 1,
        row: 1,
        seat: 1,
        student: people[0],
      }],
      note: "Current workstation sessions.",
    },
  };
}
