import assert from "node:assert/strict";
import test from "node:test";
import { formatSnapshotTime } from "@/components/ui/primitives";

test("formats snapshot time in the campus time zone without seconds", () => {
  assert.equal(
    formatSnapshotTime("2026-08-01T20:20:37.000Z", "Europe/Warsaw"),
    "22:20",
  );
});

test("uses an honest placeholder for invalid snapshot metadata", () => {
  assert.equal(formatSnapshotTime("not-a-date", "Europe/Warsaw"), "--:--");
  assert.equal(formatSnapshotTime("2026-08-01T20:20:37.000Z", "Invalid/Zone"), "--:--");
});
