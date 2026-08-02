import assert from "node:assert/strict";
import test from "node:test";
import type {
  ActiveSeatIdentity,
  PeerContributor,
  ConnectRequest,
  StudentRef,
} from "@/lib/contract";
import {
  avatarStackEntries,
  connectPageCount,
  layoutActiveSeats,
  pixelPointFromNormalized,
  requestPage,
  topPeerContributors,
} from "./helpers";

function student(id: number, login = `student${id}`): StudentRef {
  return {
    id,
    login,
    displayName: `Student ${id}`,
    image: null,
    level: 1,
  };
}

function request(id: number): ConnectRequest {
  return {
    id: String(id),
    student: student(id),
    projectId: 100 + id,
    projectName: `Project ${id}`,
    rank: id % 4,
    updatedAt: new Date(Date.UTC(2026, 6, 1, id)).toISOString(),
  };
}

test("Connect pages show six cards, cap at twelve, and wrap deterministically", () => {
  const rows = Array.from({ length: 14 }, (_, index) => request(index + 1));
  assert.deepEqual(requestPage(rows, 0).map((row) => row.id), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(requestPage(rows, 1).map((row) => row.id), ["7", "8", "9", "10", "11", "12"]);
  assert.deepEqual(requestPage(rows, 2).map((row) => row.id), ["1", "2", "3", "4", "5", "6"]);
  assert.equal(connectPageCount(rows.slice(0, 2), rows.slice(0, 9)), 2);
  assert.equal(connectPageCount([], []), 1);
});

test("Top peer evaluators use count, recency, and login as stable tie-breakers", () => {
  const rows: PeerContributor[] = [
    { student: student(1, "zeta"), completedEvaluations: 5, latestAt: "2026-07-01T10:00:00Z" },
    { student: student(2, "beta"), completedEvaluations: 7, latestAt: "2026-07-01T09:00:00Z" },
    { student: student(3, "alpha"), completedEvaluations: 5, latestAt: "2026-07-01T11:00:00Z" },
    { student: student(4, "aardvark"), completedEvaluations: 5, latestAt: "2026-07-01T11:00:00Z" },
  ];
  assert.deepEqual(
    topPeerContributors(rows, 4).map((row) => row.student.login),
    ["beta", "aardvark", "alpha", "zeta"],
  );
});

test("Avatar stack resolves roster teammates, keeps login fallbacks, and reports overflow", () => {
  const selection = avatarStackEntries(
    {
      teammates: ["known", "unknown", "KNOWN", "third"],
      teamMembers: [student(1, "known"), student(2, "extra")],
    },
    3,
  );
  assert.deepEqual(
    selection.visible.map((entry) => [entry.kind, entry.kind === "student" ? entry.student.login : entry.login]),
    [
      ["student", "known"],
      ["login", "unknown"],
      ["login", "third"],
    ],
  );
  assert.equal(selection.total, 4);
  assert.equal(selection.overflow, 1);
});

test("Active-seat layout centers avatars on workstation anchors and drops unmapped hosts", () => {
  assert.deepEqual(pixelPointFromNormalized({ x: 1.2, y: -0.1 }, 1000, 500), { x: 1000, y: 0 });

  const seat: ActiveSeatIdentity = {
    host: "c1r1s1",
    cluster: 1,
    row: 1,
    seat: 1,
    student: student(1),
  };
  const first = layoutActiveSeats([seat], () => ({ x: 4, y: 4 }), 100, 80);
  const second = layoutActiveSeats([seat], () => ({ x: 4, y: 4 }), 100, 80);
  assert.deepEqual(first, second);
  assert.equal(first[0].x, 4);
  assert.equal(first[0].y, 4);
  assert.deepEqual(layoutActiveSeats([seat], () => null, 100, 80), []);
});
