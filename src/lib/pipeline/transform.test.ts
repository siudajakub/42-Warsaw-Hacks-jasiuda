import assert from "node:assert/strict";
import test from "node:test";
import type { RawBundle } from "@/lib/pipeline/collect";
import { campusWeekStart } from "@/lib/pipeline/campus-time";
import { buildCampusActivity, buildWeeklyHighlights, parseHost, transform } from "@/lib/pipeline/transform";
import type { FtCursusUser, FtLocation, FtProjectsUser, FtScaleTeam, FtUserRef } from "@/lib/ft/types";

const NOW = new Date("2026-07-30T12:00:00Z");

function user(login: string, id: number, pool = "may", year = "2026"): FtUserRef {
  return { id, login, displayname: login.toUpperCase(), pool_month: pool, pool_year: year };
}

function cursusUser(login: string, id: number, level: number, begin = "2026-06-15T08:00:00Z"): FtCursusUser {
  return { id, begin_at: begin, end_at: null, grade: "Learner", level, cursus_id: 21, user: user(login, id) };
}

function attempt(id: number, student: FtUserRef | null, markedAt: string, options: Partial<FtProjectsUser> = {}): FtProjectsUser {
  return {
    id,
    occurrence: 0,
    final_mark: 100,
    status: "finished",
    "validated?": true,
    project: { id: 1314, name: "Libft", slug: "libft" },
    user: student,
    marked_at: markedAt,
    created_at: markedAt,
    updated_at: markedAt,
    ...options,
  };
}

function rawBundle(roster: FtCursusUser[] = []): RawBundle {
  return {
    campusId: 67,
    cursusId: 21,
    campus: { id: 67, name: "Warsaw", city: "Warsaw", country: "Poland", time_zone: "Europe/Warsaw" },
    roster,
    profileCache: { entries: {}, syncedAt: null },
    profileStatus: "complete",
    marked: [],
    waitingForCorrection: [],
    searchingForGroup: [],
    futureScaleTeams: [],
    scaleTeams: [],
    projects: [],
    presence: {
      locations: [], activeLocations: [], coalitionMemberships: [], coalitions: [],
      locationsComplete: true, activeLocationsComplete: true, coalitionsComplete: true,
      observedAt: NOW.toISOString(),
      weekStart: "2026-07-26T22:00:00.000Z", diagnostics: [], apiCalls: 0,
    },
    windowDays: 7,
    since: "2026-07-16T12:00:00Z",
    until: NOW.toISOString(),
    startedAt: NOW.toISOString(),
    apiCalls: 0,
    diagnostics: [],
    successfulScopes: [],
    waitingComplete: true,
    teamUpComplete: true,
    futureEvaluationsComplete: true,
    evaluationsComplete: true,
  };
}

test("weekly totals compare the current partial week with the same elapsed window last week", () => {
  const alice = user("alice", 1);
  const marked = [
    attempt(1, alice, "2026-07-27T09:00:00Z"),
    attempt(2, alice, "2026-07-29T09:00:00Z"),
    attempt(3, alice, "2026-07-20T09:00:00Z"),
    attempt(4, alice, "2026-07-24T15:00:00Z"), // after the matched prior-week cutoff
  ];
  const weekly = buildWeeklyHighlights(marked, [], NOW, "Europe/Warsaw");
  assert.equal(weekly.current.validations, 2);
  assert.equal(weekly.previous.validations, 1);
  assert.equal(weekly.current.exams, 0);
  assert.equal(weekly.topProject?.name, "Libft");
  assert.equal(weekly.topProject?.count, 2);
});

test("Warsaw week boundaries follow DST instead of assuming 24-hour offsets", () => {
  assert.equal(campusWeekStart(new Date("2026-03-29T12:00:00Z"), "Europe/Warsaw").toISOString(), "2026-03-22T23:00:00.000Z");
  assert.equal(campusWeekStart(new Date("2026-03-30T12:00:00Z"), "Europe/Warsaw").toISOString(), "2026-03-29T22:00:00.000Z");
});

test("campus activity clips sessions, merges overlap, parses hosts, and calculates coalition context", () => {
  const location = (id: number, begin: string, end: string | null, host: string): FtLocation => ({
    id, begin_at: begin, end_at: end, host, campus_id: 67, user: user("alice", 1),
  });
  const active = location(3, "2026-07-30T11:00:00Z", null, "c2r7s3");
  const result = buildCampusActivity({
    locations: [
      location(1, "2026-07-26T20:00:00Z", "2026-07-27T00:00:00Z", "c1r1s1"),
      location(2, "2026-07-26T23:00:00Z", "2026-07-27T01:00:00Z", "c1r1s2"),
      active,
    ],
    activeLocations: [active],
    coalitionMemberships: [{ id: 1, coalition_id: 8, user_id: 1, this_year_score: 321, created_at: "2026-01-01T00:00:00Z" }],
    coalitions: [{ id: 8, name: "Octopus", slug: "octopus", color: "#00ff00", score: 1234 }],
    locationsComplete: true, activeLocationsComplete: true, coalitionsComplete: true,
    observedAt: NOW.toISOString(), weekStart: "2026-07-26T22:00:00Z", diagnostics: [], apiCalls: 0,
  }, [cursusUser("alice", 1, 2)], NOW);
  // 22:00-01:00 merged plus 11:00-12:00 = 240 minutes, not double-counted.
  assert.equal(result.totalMinutes, 240);
  assert.equal(result.currentOccupancy, 1);
  assert.equal(result.topStudents[0].displayName, "ALICE");
  assert.equal(result.coalitions[0].minutesPerActiveMember, 240);
  assert.equal(result.coalitions[0].score, 1234);
  assert.equal(result.coalitions[0].topPointsContributor?.student.login, "alice");
  assert.equal(result.coalitions[0].topPointsContributor?.points, 321);
  assert.equal(result.coalitions[0].topTimeContributor?.student.login, "alice");
  assert.equal(result.coalitions[0].topTimeContributor?.minutes, 240);
  assert.equal(result.coalitionScoreStatus, "ready");
  assert.equal(result.coalitionContributorStatus, "ready");
  assert.deepEqual(parseHost("c3r16s4"), { cluster: 3, row: 16, seat: 4 });
  assert.deepEqual(parseHost("unknown"), { cluster: null, row: null, seat: null });
});

test("coalition cards select separate leaders for official points and weekly cluster time", () => {
  const location = (id: number, login: string, userId: number, begin: string): FtLocation => ({
    id,
    begin_at: begin,
    end_at: "2026-07-30T12:00:00Z",
    host: `c1r${id}s1`,
    campus_id: 67,
    user: user(login, userId),
  });
  const result = buildCampusActivity({
    locations: [
      location(1, "alice", 1, "2026-07-30T09:00:00Z"),
      location(2, "bob", 2, "2026-07-30T11:00:00Z"),
    ],
    activeLocations: [],
    coalitionMemberships: [
      { id: 1, coalition_id: 8, user_id: 1, this_year_score: 1_500, created_at: "2026-01-01T00:00:00Z" },
      { id: 2, coalition_id: 8, user_id: 2, this_year_score: 2_200, created_at: "2026-01-01T00:00:00Z" },
    ],
    coalitions: [{ id: 8, name: "Octopus", slug: "octopus", score: 8_000 }],
    locationsComplete: true,
    activeLocationsComplete: true,
    coalitionsComplete: true,
    observedAt: NOW.toISOString(),
    weekStart: "2026-07-26T22:00:00Z",
    diagnostics: [],
    apiCalls: 0,
  }, [cursusUser("alice", 1, 2), cursusUser("bob", 2, 2)], NOW);

  assert.equal(result.coalitions[0].topPointsContributor?.student.login, "bob");
  assert.equal(result.coalitions[0].topPointsContributor?.points, 2_200);
  assert.equal(result.coalitions[0].topTimeContributor?.student.login, "alice");
  assert.equal(result.coalitions[0].topTimeContributor?.minutes, 180);
  assert.equal(result.coalitionContributorStatus, "ready");
});

test("campus Top 5 breaks time ties by login and marks missing coalitions as partial", () => {
  const location = (id: number, login: string, userId: number): FtLocation => ({
    id,
    begin_at: "2026-07-30T10:00:00Z",
    end_at: "2026-07-30T11:00:00Z",
    host: `c1r${id}s1`,
    campus_id: 67,
    user: user(login, userId),
  });
  const result = buildCampusActivity({
    locations: [location(1, "zeta", 2), location(2, "alpha", 1)],
    activeLocations: [],
    coalitionMemberships: [],
    coalitions: [],
    locationsComplete: true, activeLocationsComplete: true, coalitionsComplete: true,
    observedAt: NOW.toISOString(),
    weekStart: "2026-07-26T22:00:00Z",
    diagnostics: [], apiCalls: 0,
  }, [], NOW);
  assert.equal(result.topStudents[0].login, "alpha");
  assert.equal(result.status, "partial");
  assert.deepEqual(result.coalitions, []);
});

test("unidentified validations count in weekly highlights but never create an invented Completed card", () => {
  const alice = user("alice", 1);
  const raw = rawBundle([cursusUser("alice", 1, 2)]);
  raw.marked = [
    attempt(1, alice, "2026-07-29T09:00:00Z"),
    attempt(2, null, "2026-07-29T10:00:00Z"),
  ];
  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.weekly.current.validations, 2);
  assert.equal(snapshot.celebrations.length, 1);
  assert.equal(snapshot.celebrations[0].student.login, "alice");
  assert.deepEqual(snapshot.celebrations[0].achievements, ["first_core", "first_try"]);
  assert.equal("heat" in snapshot.celebrations[0], false);
  assert.equal("momentum" in snapshot, false);
  assert.equal("climb" in snapshot, false);
});

test("celebrations classify distinct and overlapping achievement types", () => {
  const alice = user("alice", 1);
  const raw = rawBundle([cursusUser("alice", 1, 4), cursusUser("bob", 2, 3)]);
  raw.marked = [
    attempt(1, alice, "2026-07-29T08:00:00Z", {
      project: { id: 1314, name: "Libft", slug: "libft" },
      final_mark: 125,
      current_team_id: 2,
      teams: [
        { id: 1, updated_at: "2026-07-20T08:00:00Z", users: [{ id: 1, login: "alice" }, { id: 3, login: "oldmate" }] },
        { id: 2, updated_at: "2026-07-29T08:00:00Z", users: [{ id: 1, login: "alice" }, { id: 2, login: "bob" }] },
      ],
    }),
    attempt(2, alice, "2026-07-29T09:00:00Z", {
      project: { id: 1320, name: "Exam Rank 02", slug: "exam-rank-02" },
      occurrence: 2,
    }),
  ];
  const snapshot = transform(raw, NOW);
  const libft = snapshot.celebrations.find((row) => row.projectSlug === "libft");
  const exam = snapshot.celebrations.find((row) => row.projectSlug === "exam-rank-02");
  assert.deepEqual(libft?.achievements, ["first_core", "perfect", "team", "first_try"]);
  assert.deepEqual(libft?.teammates, ["bob"]);
  assert.deepEqual(libft?.teamMembers.map((row) => row.login), ["bob"]);
  assert.deepEqual(exam?.achievements, ["exam", "persistence"]);
  assert.equal(snapshot.weekly.current.exams, 1);
});

test("Connect deduplicates evaluator requests and names roster students only", () => {
  const alice = user("alice", 1);
  const raw = rawBundle([cursusUser("alice", 1, 2)]);
  raw.waitingForCorrection = [
    attempt(20, alice, "2026-07-29T08:00:00Z", { status: "waiting_for_correction", "validated?": false, marked_at: null, current_team_id: 10 }),
    attempt(21, alice, "2026-07-29T11:00:00Z", { status: "waiting_for_correction", "validated?": false, marked_at: null, current_team_id: 10 }),
    attempt(22, null, "2026-07-29T12:00:00Z", {
      status: "waiting_for_correction", "validated?": false, marked_at: null,
      current_team_id: 11,
      project: { id: 1471, name: "push_swap", slug: "push_swap" },
    }),
  ];
  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.connect.needsEvaluator.open, 2);
  assert.equal(snapshot.connect.needsEvaluator.requests.length, 1);
  assert.equal(snapshot.connect.needsEvaluator.requests[0].student.login, "alice");
  assert.deepEqual(
    snapshot.connect.needsEvaluator.projects.map((row) => [row.projectName, row.open]),
    [["Libft", 1], ["push_swap", 1]],
  );
});

test("needs-evaluator excludes every waiting member of a team with a future evaluation", () => {
  const alice = user("alice", 1);
  const bob = user("bob", 2);
  const raw = rawBundle([cursusUser("alice", 1, 2), cursusUser("bob", 2, 2)]);
  raw.waitingForCorrection = [
    attempt(30, alice, "2026-07-30T09:00:00Z", { status: "waiting_for_correction", current_team_id: 50, marked_at: null }),
    attempt(31, bob, "2026-07-30T09:00:00Z", { status: "waiting_for_correction", current_team_id: 50, marked_at: null }),
    attempt(32, alice, "2026-07-30T10:00:00Z", {
      status: "waiting_for_correction",
      current_team_id: 51,
      marked_at: null,
      project: { id: 1471, name: "push_swap", slug: "push_swap" },
    }),
  ];
  raw.futureScaleTeams = [{
    id: 90,
    begin_at: "2026-07-30T14:00:00Z",
    filled_at: null,
    final_mark: null,
    team: { id: 50 },
  }];

  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.connect.needsEvaluator.open, 1);
  assert.deepEqual(snapshot.connect.needsEvaluator.requests.map((row) => row.projectName), ["push_swap"]);
});

test("needs-evaluator excludes work experience and internship projects", () => {
  const alice = user("alice", 1);
  const bob = user("bob", 2);
  const raw = rawBundle([cursusUser("alice", 1, 2), cursusUser("bob", 2, 2)]);
  raw.waitingForCorrection = [
    attempt(33, alice, "2026-07-30T09:00:00Z", {
      status: "waiting_for_correction",
      current_team_id: 52,
      marked_at: null,
      project: { id: 2001, name: "Work Experience", slug: "work-experience" },
    }),
    attempt(34, bob, "2026-07-30T09:00:00Z", {
      status: "waiting_for_correction",
      current_team_id: 53,
      marked_at: null,
      project: { id: 1471, name: "push_swap", slug: "push_swap" },
    }),
  ];
  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.connect.needsEvaluator.open, 1);
  assert.deepEqual(snapshot.connect.needsEvaluator.requests.map((row) => row.student.login), ["bob"]);
  assert.deepEqual(snapshot.connect.needsEvaluator.requests.map((row) => row.projectName), ["push_swap"]);
});

test("needs-evaluator fails closed when future appointments are incomplete", () => {
  const raw = rawBundle([cursusUser("alice", 1, 2)]);
  raw.waitingForCorrection = [
    attempt(40, user("alice", 1), "2026-07-30T09:00:00Z", {
      status: "waiting_for_correction",
      current_team_id: 60,
      marked_at: null,
    }),
  ];
  raw.futureEvaluationsComplete = false;
  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.connect.needsEvaluator.status, "partial");
  assert.equal(snapshot.connect.needsEvaluator.open, null);
  assert.deepEqual(snapshot.connect.needsEvaluator.requests, []);
});

test("Team Up counts deduplicated unidentified demand, requires explicit team metadata, and caps fresh named cards", () => {
  const roster = Array.from({ length: 11 }, (_, index) => cursusUser(`student${index + 1}`, index + 1, 2));
  const raw = rawBundle(roster);
  raw.projects = [{
    id: 900,
    name: "Team Project",
    slug: "team-project",
    project_sessions: [{ id: 1, campus_id: 67, cursus_id: 21, solo: false }],
  }, {
    id: 901,
    name: "Solo Project",
    slug: "solo-project",
    project_sessions: [{ id: 2, campus_id: 67, cursus_id: 21, solo: true }],
  }];
  const searching = (id: number, who: FtUserRef | null, projectId = 900, updatedAt = "2026-07-29T10:00:00Z") =>
    attempt(id, who, updatedAt, {
      status: "searching_a_group",
      "validated?": false,
      marked_at: null,
      updated_at: updatedAt,
      project: {
        id: projectId,
        name: projectId === 900 ? "Team Project" : projectId === 901 ? "Solo Project" : "Unknown",
        slug: projectId === 900 ? "team-project" : projectId === 901 ? "solo-project" : "unknown",
      },
    });
  raw.searchingForGroup = [
    ...roster.slice(0, 10).map((row, index) => searching(100 + index, row.user ?? null)),
    searching(50, roster[0].user ?? null, 900, "2026-07-28T10:00:00Z"), // older duplicate
    searching(200, null),
    searching(201, roster[10].user ?? null, 900, "2026-06-01T10:00:00Z"), // too old for a named card
    searching(202, user("not-in-roster", 99)),
    searching(203, null, 901),
    searching(204, null, 999),
  ];

  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.connect.teamUp.searching, 13);
  assert.equal(snapshot.connect.teamUp.requests.length, 8);
  assert.equal(snapshot.connect.teamUp.requests.some((row) => row.student.login === "student11"), false);
  assert.equal(snapshot.connect.teamUp.requests.some((row) => row.student.login === "not-in-roster"), false);
  assert.equal(snapshot.connect.teamUp.status, "partial");
});

test("peer contributors use unique filled, non-truant evaluations since Monday and name roster correctors only", () => {
  const alice = user("alice", 1);
  const bob = user("bob", 2);
  const raw = rawBundle([cursusUser("alice", 1, 3), cursusUser("bob", 2, 2)]);
  const scale = (
    id: number,
    corrector: FtScaleTeam["corrector"],
    filledAt: string | null,
    truant?: FtScaleTeam["truant"],
  ): FtScaleTeam => ({
    id,
    begin_at: filledAt ?? "2026-07-29T08:00:00Z",
    filled_at: filledAt,
    final_mark: 100,
    corrector,
    truant,
  });
  raw.scaleTeams = [
    scale(1, alice, "2026-07-27T08:00:00Z"),
    scale(1, alice, "2026-07-27T09:00:00Z"), // same evaluation, later payload wins
    scale(2, alice, "2026-07-28T08:00:00Z"),
    scale(3, "hidden-corrector", "2026-07-29T08:00:00Z"),
    scale(4, user("former-student", 99), "2026-07-29T09:00:00Z"),
    scale(5, bob, "2026-07-29T10:00:00Z", bob),
    scale(6, bob, null),
    scale(7, bob, "2026-07-20T08:00:00Z"),
    scale(8, bob, "2026-08-02T08:00:00Z"),
  ];

  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.connect.peerContributors.totalCompleted, 4);
  assert.deepEqual(
    snapshot.connect.peerContributors.evaluators.map((row) => [row.student.login, row.completedEvaluations]),
    [["alice", 2]],
  );
  assert.equal(snapshot.weekly.current.evaluations, 4);
});

test("Campus exposes active-seat avatars only from a complete current feed", () => {
  const active: FtLocation = {
    id: 10,
    begin_at: "2026-07-30T10:00:00Z",
    end_at: null,
    host: "c2r3s4",
    campus_id: 67,
    user: user("alice", 1),
  };
  const base = {
    locations: [active],
    activeLocations: [active],
    coalitionMemberships: [],
    coalitions: [],
    locationsComplete: true,
    coalitionsComplete: true,
    observedAt: NOW.toISOString(),
    weekStart: "2026-07-26T22:00:00Z",
    diagnostics: [],
    apiCalls: 0,
  };
  const partial = buildCampusActivity(
    { ...base, activeLocationsComplete: false },
    [cursusUser("alice", 1, 2)],
    NOW,
    [],
    [],
  );
  assert.equal(partial.activeSeatStatus, "partial");
  assert.deepEqual(partial.activeSeats, []);
  assert.equal(partial.currentOccupancy, 1);

  const live = buildCampusActivity(
    { ...base, activeLocationsComplete: true },
    [cursusUser("alice", 1, 2)],
    NOW,
    [],
    [],
  );
  assert.equal(live.activeSeatStatus, "live");
  assert.equal(live.activeSeats[0].student.login, "alice");
  assert.deepEqual(
    { cluster: live.activeSeats[0].cluster, row: live.activeSeats[0].row, seat: live.activeSeats[0].seat },
    { cluster: 2, row: 3, seat: 4 },
  );
});

test("Campus skips conflicting hosts and selects one newest host per student", () => {
  const active = (
    id: number,
    login: string,
    userId: number,
    host: string,
    beginAt: string,
  ): FtLocation => ({
    id,
    begin_at: beginAt,
    end_at: null,
    host,
    campus_id: 67,
    user: user(login, userId),
  });
  const aliceOld = active(1, "alice", 1, "c1r1s1", "2026-07-30T09:00:00Z");
  const aliceNew = active(2, "alice", 1, "c1r1s2", "2026-07-30T10:00:00Z");
  const sharedAlice = active(3, "alice", 1, "c1r1s3", "2026-07-30T11:00:00Z");
  const sharedBob = active(4, "bob", 2, "c1r1s3", "2026-07-30T11:10:00Z");
  const rows = [aliceOld, aliceNew, sharedAlice, sharedBob];
  const result = buildCampusActivity({
    locations: rows,
    activeLocations: rows,
    coalitionMemberships: [],
    coalitions: [],
    locationsComplete: true,
    activeLocationsComplete: true,
    coalitionsComplete: true,
    observedAt: NOW.toISOString(),
    weekStart: "2026-07-26T22:00:00Z",
    diagnostics: [],
    apiCalls: 0,
  }, [cursusUser("alice", 1, 2), cursusUser("bob", 2, 2)], NOW);

  assert.deepEqual(result.activeSeats.map((row) => [row.host, row.student.login]), [["c1r1s2", "alice"]]);
  assert.equal(result.workstations.find((row) => row.host === "c1r1s3")?.active, true);
});

test("hydrated profiles and the current-bloc membership enrich a points contributor", () => {
  const alice = user("alice", 1);
  const raw = rawBundle([cursusUser("alice", 1, 4)]);
  raw.profileCache = {
    syncedAt: NOW.toISOString(),
    entries: {
      "1": {
        id: 1,
        login: "alice",
        displayName: "Alice Hydrated",
        image: "https://cdn.example/alice.jpg",
        syncedAt: NOW.toISOString(),
      },
    },
  };
  raw.marked = [attempt(1, alice, "2026-07-29T09:00:00Z")];
  raw.presence.coalitionMemberships = [
    { id: 1, coalition_id: 8, user_id: 1, this_year_score: 1_337, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-07-30T09:00:00Z" },
    { id: 2, coalition_id: 9, user_id: 1, this_year_score: 999, created_at: "2026-07-29T09:00:00Z" },
  ];
  raw.presence.coalitions = [
    { id: 8, name: "Octopus", slug: "octopus" },
  ];

  const snapshot = transform(raw, NOW);
  assert.equal(snapshot.celebrations[0].student.displayName, "Alice Hydrated");
  assert.equal(snapshot.celebrations[0].student.image, "https://cdn.example/alice.jpg");
  assert.equal(snapshot.campusActivity.coalitions.find((row) => row.id === 8)?.topPointsContributor?.student.login, "alice");
  assert.equal(snapshot.campusActivity.coalitions.find((row) => row.id === 8)?.topPointsContributor?.points, 1_337);
  assert.equal(snapshot.campusActivity.coalitions.some((row) => row.id === 9), false);
});
