import { SCENE_SCHEDULE, type SceneId } from "@/lib/scene-schedule";

export function parseRequestedScene(
  value: string | string[] | undefined,
): SceneId | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  if (SCENE_SCHEDULE.some((scene) => scene.id === raw)) return raw as SceneId;
  const index = Number(raw) - 1;
  return Number.isInteger(index) && index >= 0 && index < SCENE_SCHEDULE.length
    ? SCENE_SCHEDULE[index].id
    : null;
}
