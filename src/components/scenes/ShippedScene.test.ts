import assert from "node:assert/strict";
import test from "node:test";
import { makeSnapshotFixture } from "@/test/snapshot-fixture";
import { selectSpotlights } from "@/components/scenes/shipped-select";

test("spotlights prefer three recent, different achievement stories", () => {
  const snapshot = makeSnapshotFixture(42, new Date("2026-07-30T12:00:00Z"));
  const spotlights = selectSpotlights(snapshot.celebrations);
  assert.equal(spotlights.length, 3);
  assert.equal(new Set(spotlights.map((row) => row.achievements[0])).size, 3);
});
