import assert from "node:assert/strict";
import test from "node:test";
import { makeSnapshotFixture } from "@/test/snapshot-fixture";
import { dashboardStatus, diagnostic } from "@/lib/pipeline/diagnostics";

const now = new Date("2026-07-30T12:00:00Z");

test("dashboard status distinguishes live, partial, stale and error", () => {
  const live = { ...makeSnapshotFixture(3, now), diagnostics: [] };
  assert.equal(dashboardStatus(live), "LIVE");

  const partial = {
    ...live,
    diagnostics: [
      diagnostic("evaluations_failed", "evaluations", "warning", "Feed missing", false, now),
    ],
  };
  assert.equal(dashboardStatus(partial), "PARTIAL");

  const failed = {
    ...live,
    diagnostics: [
      diagnostic("refresh_failed", "pipeline", "error", "Last good in use", true, now),
    ],
  };
  assert.equal(dashboardStatus(failed), "STALE");
  assert.equal(dashboardStatus(live, true), "STALE");
  assert.equal(dashboardStatus(null), "ERROR");
});
