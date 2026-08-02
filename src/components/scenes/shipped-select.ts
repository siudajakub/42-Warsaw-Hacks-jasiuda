import type { AchievementKind, Celebration } from "@/lib/contract";

export function selectSpotlights(celebrations: readonly Celebration[]): Celebration[] {
  const selected: Celebration[] = [];
  const seenKinds = new Set<AchievementKind>();
  const seenStudents = new Set<number>();
  for (const celebration of celebrations) {
    const primary = celebration.achievements[0] ?? "first_try";
    if (seenKinds.has(primary) || seenStudents.has(celebration.student.id)) continue;
    selected.push(celebration);
    seenKinds.add(primary);
    seenStudents.add(celebration.student.id);
    if (selected.length === 3) return selected;
  }
  for (const celebration of celebrations) {
    if (!selected.some((row) => row.id === celebration.id) && !seenStudents.has(celebration.student.id)) {
      selected.push(celebration);
      seenStudents.add(celebration.student.id);
    }
    if (selected.length === 3) break;
  }
  return selected;
}
