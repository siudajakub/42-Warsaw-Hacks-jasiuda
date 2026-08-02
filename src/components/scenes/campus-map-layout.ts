export type CampusClusterId = 1 | 2 | 3;

export interface CampusPoint {
  x: number;
  y: number;
}

export interface CampusDeskDefinition {
  cluster: CampusClusterId;
  row: number;
  seats: Array<CampusPoint & { seat: number }>;
}

interface CampusSeatDefinition extends CampusPoint {
  host: string;
  cluster: CampusClusterId;
  row: number;
  seat: number;
}

interface CampusClusterZone {
  id: CampusClusterId;
  points: readonly CampusPoint[];
}

export interface CampusWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CampusPassage {
  id: "c1-c2" | "c2-c3";
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CAMPUS_MAP_WIDTH = 1080;
export const CAMPUS_MAP_HEIGHT = 480;
export const WORKSTATION_SIZE = 18;
export const WORKSTATION_GAP = 4;

export const CAMPUS_CLUSTER_ZONES: readonly CampusClusterZone[] = [
  {
    id: 1,
    points: [
      { x: 14, y: 40 },
      { x: 250, y: 40 },
      { x: 250, y: 440 },
      { x: 14, y: 440 },
    ],
  },
  {
    id: 2,
    points: [
      { x: 250, y: 165 },
      { x: 690, y: 165 },
      { x: 690, y: 350 },
      { x: 250, y: 350 },
    ],
  },
  {
    id: 3,
    points: [
      { x: 690, y: 40 },
      { x: 1066, y: 18 },
      { x: 1066, y: 440 },
      { x: 690, y: 460 },
    ],
  },
] as const;

// Fills describe ownership; walls describe physical barriers. Keeping them
// separate lets adjacent clusters share a boundary without drawing it twice,
// and makes the two circulation openings real gaps rather than white overlays.
export const CAMPUS_WALLS: readonly CampusWall[] = [
  { x1: 14, y1: 40, x2: 250, y2: 40 },
  { x1: 14, y1: 40, x2: 14, y2: 440 },
  { x1: 14, y1: 440, x2: 250, y2: 440 },
  { x1: 250, y1: 40, x2: 250, y2: 235 },
  { x1: 250, y1: 280, x2: 250, y2: 440 },
  { x1: 250, y1: 165, x2: 690, y2: 165 },
  { x1: 250, y1: 350, x2: 414, y2: 350 },
  { x1: 472, y1: 350, x2: 690, y2: 350 },
  { x1: 690, y1: 40, x2: 690, y2: 235 },
  { x1: 690, y1: 280, x2: 690, y2: 460 },
  { x1: 690, y1: 40, x2: 1066, y2: 18 },
  { x1: 1066, y1: 18, x2: 1066, y2: 440 },
  { x1: 1066, y1: 440, x2: 690, y2: 460 },
] as const;

export const CAMPUS_PASSAGES: readonly CampusPassage[] = [
  { id: "c1-c2", x: 241, y: 235, width: 18, height: 45 },
  { id: "c2-c3", x: 681, y: 235, width: 18, height: 45 },
] as const;

// These are the two reference desk shapes after rotating the supplied map
// 90 degrees left. Keeping the rotation explicit protects the physical row
// order instead of treating clusters as arbitrary grids.
const rotatedZigzagDown = (x: number, y: number) => [
  { seat: 4, x, y },
  { seat: 3, x: x + 22, y: y + 22 },
  { seat: 2, x: x + 44, y },
  { seat: 1, x: x + 66, y: y + 22 },
];

const rotatedZigzagUp = (x: number, y: number) => [
  { seat: 1, x, y },
  { seat: 2, x: x + 22, y: y + 22 },
  { seat: 3, x: x + 44, y },
  { seat: 4, x: x + 66, y: y + 22 },
];

const rotatedCross = (x: number, y: number) => [
  { seat: 4, x, y },
  { seat: 3, x: x + 22, y: y + 22 },
  { seat: 2, x, y: y + 44 },
  { seat: 1, x: x + 22, y: y + 66 },
];

const clusterOneFirstColumn: CampusDeskDefinition[] = Array.from({ length: 7 }, (_, index) => ({
    cluster: 1,
    row: 7 - index,
    seats: rotatedZigzagDown(24, 76 + index * 45),
  }));

const clusterOneSecondColumn: CampusDeskDefinition[] = Array.from({ length: 6 }, (_, index) => ({
    cluster: 1,
    row: index + 8,
    seats: rotatedZigzagUp(150, 76 + index * 45),
  }));

const clusterTwo: CampusDeskDefinition[] = Array.from({ length: 9 }, (_, index) => {
  const x = 278 + index * 44;
  return {
    cluster: 2,
    row: index + 1,
    seats: rotatedCross(x, 220),
  };
});

const clusterThreeLeft: CampusDeskDefinition[] = Array.from({ length: 7 }, (_, index) => ({
    cluster: 3,
    row: 7 - index,
    seats: rotatedZigzagDown(710, 70 + index * 44),
  }));

const clusterThreeTop: CampusDeskDefinition[] = Array.from({ length: 3 }, (_, index) => {
  const x = 810 + index * 58;
  return {
    cluster: 3,
    row: index + 8,
    seats: rotatedCross(x, 60),
  };
});

const clusterThreeRight: CampusDeskDefinition[] = [16, 15, 14, 13, 12, 11].map((row, index) => {
  const y = index < 3 ? 70 + index * 44 : 250 + (index - 3) * 44;
  return {
    cluster: 3,
    row,
    seats: rotatedZigzagDown(970, y),
  };
});

export const CAMPUS_DESKS: readonly CampusDeskDefinition[] = [
  ...clusterOneFirstColumn,
  ...clusterOneSecondColumn,
  ...clusterTwo,
  ...clusterThreeLeft,
  ...clusterThreeTop,
  ...clusterThreeRight,
];

export const CAMPUS_SEATS: readonly CampusSeatDefinition[] = CAMPUS_DESKS.flatMap((desk) =>
  desk.seats.map((seat) => ({
    ...seat,
    host: `c${desk.cluster}r${desk.row}s${seat.seat}`,
    cluster: desk.cluster,
    row: desk.row,
  })),
);

export const CAMPUS_SEAT_POINTS: ReadonlyMap<string, CampusPoint> = new Map(
  CAMPUS_SEATS.map(({ host, x, y }) => [host, { x, y }]),
);

export function clusterZone(cluster: CampusClusterId): CampusClusterZone {
  const zone = CAMPUS_CLUSTER_ZONES.find((candidate) => candidate.id === cluster);
  if (!zone) throw new Error(`Unknown campus cluster ${cluster}`);
  return zone;
}

export function pointInPolygon(point: CampusPoint, polygon: readonly CampusPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
        (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
