import assert from "node:assert/strict";
import test from "node:test";
import { makeSnapshotFixture } from "@/test/snapshot-fixture";
import {
  annotateLastGood,
  parseStoredState,
  retainConnectSections,
} from "@/lib/pipeline/store";

const now = new Date("2026-07-30T12:00:00Z");

function envelope(version = 11) {
  return {
    version,
    snapshot: makeSnapshotFixture(7, now),
    profileCache: { syncedAt: null, entries: {} },
    profileStatus: "ready",
    sectionLastSuccess: { roster: now.toISOString() },
  };
}

test("accepts only the current v11 cache envelope", () => {
  const stored = parseStoredState(envelope());
  assert.equal(stored?.snapshot.connect.status, "ready");
  assert.equal(stored?.sectionLastSuccess.roster, now.toISOString());
  assert.equal(parseStoredState(envelope(10)), null);
  assert.equal(parseStoredState({ ...envelope(), levelHistory: [] }), null);

  const legacySnapshot = structuredClone(envelope());
  delete (legacySnapshot.snapshot as Partial<typeof legacySnapshot.snapshot>).connect;
  assert.equal(parseStoredState(legacySnapshot), null);
});

test("Connect sections keep independent fallback policy", () => {
  const previous = makeSnapshotFixture(21, now).connect;
  const current = makeSnapshotFixture(22, new Date(now.getTime() + 60_000)).connect;

  const teamUpPartial = retainConnectSections(previous, current, {
    needsEvaluator: true,
    teamUp: false,
    evaluations: true,
  });
  assert.deepEqual(teamUpPartial.needsEvaluator, current.needsEvaluator);
  assert.deepEqual(teamUpPartial.teamUp.requests, previous.teamUp.requests);
  assert.equal(teamUpPartial.teamUp.status, "partial");

  const evaluationPartial = retainConnectSections(previous, current, {
    needsEvaluator: true,
    teamUp: true,
    evaluations: false,
  });
  assert.deepEqual(evaluationPartial.teamUp, current.teamUp);
  assert.deepEqual(evaluationPartial.peerContributors.evaluators, previous.peerContributors.evaluators);
  assert.equal(evaluationPartial.peerContributors.status, "partial");

  const evaluatorPartial = retainConnectSections(previous, current, {
    needsEvaluator: false,
    teamUp: true,
    evaluations: true,
  });
  assert.equal(evaluatorPartial.needsEvaluator.status, "partial");
  assert.equal(evaluatorPartial.needsEvaluator.open, null);
  assert.deepEqual(evaluatorPartial.needsEvaluator.requests, []);
});

test("last-good fallback preserves data and adds one refresh diagnostic", () => {
  const snapshot = makeSnapshotFixture(5, now);
  const stale = annotateLastGood(snapshot, new Error("42 API 503"), new Date("2026-07-30T12:10:00Z"));

  assert.equal(stale.generatedAt, snapshot.generatedAt);
  assert.deepEqual(stale.celebrations, snapshot.celebrations);
  assert.equal(stale.diagnostics.at(-1)?.code, "refresh_failed");
  assert.equal(stale.diagnostics.at(-1)?.fallbackActive, true);
});
