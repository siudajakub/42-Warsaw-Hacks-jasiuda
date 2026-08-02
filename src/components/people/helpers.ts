import type {
  ActiveSeatIdentity,
  Celebration,
  PeerContributor,
  ConnectRequest,
  StudentRef,
} from "@/lib/contract";

const CONNECT_PAGE_SIZE = 6;
const CONNECT_MAX_REQUESTS = 12;
export const CONNECT_PAGE_MS = 9_000;

export function requestPage<T>(rows: readonly T[], page: number): T[] {
  const limited = rows.slice(0, CONNECT_MAX_REQUESTS);
  const pageCount = Math.max(1, Math.ceil(limited.length / CONNECT_PAGE_SIZE));
  const safePage = ((page % pageCount) + pageCount) % pageCount;
  const start = safePage * CONNECT_PAGE_SIZE;
  return limited.slice(start, start + CONNECT_PAGE_SIZE);
}

export function connectPageCount(
  peerRequests: readonly ConnectRequest[],
  teamRequests: readonly ConnectRequest[],
): number {
  const count = (rows: readonly ConnectRequest[]) =>
    Math.ceil(Math.min(rows.length, CONNECT_MAX_REQUESTS) / CONNECT_PAGE_SIZE);
  return Math.max(1, count(peerRequests), count(teamRequests));
}

export function topPeerContributors(
  rows: readonly PeerContributor[],
  limit = 6,
): PeerContributor[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.completedEvaluations - a.completedEvaluations ||
        Date.parse(b.latestAt) - Date.parse(a.latestAt) ||
        a.student.login.localeCompare(b.student.login),
    )
    .slice(0, limit);
}

type AvatarStackEntry =
  | { kind: "student"; key: string; student: StudentRef }
  | { kind: "login"; key: string; login: string };

interface AvatarStackSelection {
  visible: AvatarStackEntry[];
  overflow: number;
  total: number;
}

export function avatarStackEntries(
  celebration: Pick<Celebration, "teamMembers" | "teammates">,
  maxVisible = 4,
): AvatarStackSelection {
  const byLogin = new Map<string, StudentRef>();
  for (const student of celebration.teamMembers) {
    byLogin.set(student.login.toLowerCase(), student);
  }

  const logins = new Set<string>();
  const entries: AvatarStackEntry[] = [];
  for (const login of celebration.teammates) {
    const key = login.toLowerCase();
    if (logins.has(key)) continue;
    logins.add(key);
    const student = byLogin.get(key);
    entries.push(
      student
        ? { kind: "student", key: `student:${student.id}`, student }
        : { kind: "login", key: `login:${key}`, login },
    );
  }

  for (const student of celebration.teamMembers) {
    const key = student.login.toLowerCase();
    if (logins.has(key)) continue;
    logins.add(key);
    entries.push({ kind: "student", key: `student:${student.id}`, student });
  }

  const safeLimit = Math.max(0, maxVisible);
  return {
    visible: entries.slice(0, safeLimit),
    overflow: Math.max(0, entries.length - safeLimit),
    total: entries.length,
  };
}

export interface PixelPoint {
  x: number;
  y: number;
}

export interface NormalizedPoint {
  /** Horizontal position in the inclusive 0..1 range. */
  x: number;
  /** Vertical position in the inclusive 0..1 range. */
  y: number;
}

interface ActiveSeatLayout extends PixelPoint {
  seat: ActiveSeatIdentity;
}

export function pixelPointFromNormalized(
  point: NormalizedPoint,
  width: number,
  height: number,
): PixelPoint {
  return {
    x: Math.max(0, Math.min(1, point.x)) * width,
    y: Math.max(0, Math.min(1, point.y)) * height,
  };
}

export function layoutActiveSeats(
  seats: readonly ActiveSeatIdentity[],
  resolveAnchor: (host: string) => PixelPoint | null | undefined,
  width: number,
  height: number,
): ActiveSeatLayout[] {
  const resolved = seats
    .map((seat) => ({ seat, anchor: resolveAnchor(seat.host) }))
    .filter(
      (row): row is { seat: ActiveSeatIdentity; anchor: PixelPoint } =>
        Boolean(
          row.anchor &&
            Number.isFinite(row.anchor.x) &&
            Number.isFinite(row.anchor.y),
        ),
  );
  return resolved.map(({ seat, anchor }) => {
    const x = Math.max(0, Math.min(width, anchor.x));
    const y = Math.max(0, Math.min(height, anchor.y));
    return { x, y, seat };
  });
}
