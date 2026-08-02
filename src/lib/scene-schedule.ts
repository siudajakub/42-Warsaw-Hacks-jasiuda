/** The ambient wall completes one predictable loop every minute. */
export const SCENE_SCHEDULE = [
  { id: "shipped", label: "Completed", durationSeconds: 24 },
  { id: "connect", label: "Connect", durationSeconds: 18 },
  { id: "campus", label: "Campus", durationSeconds: 18 },
] as const;

export type SceneId = (typeof SCENE_SCHEDULE)[number]["id"];

export const TOTAL_SCENE_SECONDS = SCENE_SCHEDULE.reduce(
  (total, scene) => total + scene.durationSeconds,
  0,
);
