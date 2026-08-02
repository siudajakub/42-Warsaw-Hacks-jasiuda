const DAY_MS = 86_400_000;

function campusDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zonedParts(date: Date, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

/** Convert a campus-local YYYY-MM-DD midnight to its UTC instant. */
function campusMidnight(key: string, timeZone: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += targetAsUtc - represented;
  }
  return new Date(guess);
}

export function campusWeekStart(now: Date, timeZone: string): Date {
  const today = campusDateKey(now, timeZone);
  const noon = new Date(`${today}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const mondayKey = campusDateKey(new Date(noon.getTime() - Math.max(0, index) * DAY_MS), timeZone);
  return campusMidnight(mondayKey, timeZone);
}
