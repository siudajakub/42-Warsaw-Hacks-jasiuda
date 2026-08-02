import assert from "node:assert/strict";
import test from "node:test";
import { SCENE_SCHEDULE, TOTAL_SCENE_SECONDS } from "@/lib/scene-schedule";

test("ambient scene schedule is an exact one-minute loop", () => {
  assert.deepEqual(
    SCENE_SCHEDULE.map((scene) => [scene.id, scene.durationSeconds]),
    [
      ["shipped", 24],
      ["connect", 18],
      ["campus", 18],
    ],
  );
  assert.equal(TOTAL_SCENE_SECONDS, 60);
});

test("every scene remains readable during a passing encounter", () => {
  assert.ok(SCENE_SCHEDULE.every((scene) => scene.durationSeconds >= 12));
  assert.ok(SCENE_SCHEDULE.every((scene) => scene.durationSeconds <= 24));
});
