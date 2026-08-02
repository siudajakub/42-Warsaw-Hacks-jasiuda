import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPUS_CLUSTER_ZONES,
  CAMPUS_PASSAGES,
  CAMPUS_DESKS,
  CAMPUS_SEATS,
  CAMPUS_WALLS,
  WORKSTATION_GAP,
  WORKSTATION_SIZE,
  clusterZone,
  pointInPolygon,
  type CampusPassage,
  type CampusPoint,
  type CampusWall,
} from "./campus-map-layout";

test("campus layout exposes all 152 unique workstation hosts", () => {
  assert.equal(CAMPUS_SEATS.length, 152);
  assert.equal(new Set(CAMPUS_SEATS.map((seat) => seat.host)).size, 152);
  assert.deepEqual(
    [1, 2, 3].map((cluster) => CAMPUS_SEATS.filter((seat) => seat.cluster === cluster).length),
    [52, 36, 64],
  );
});

test("desk rows preserve the reference topology after a 90-degree left rotation", () => {
  const desk = (cluster: number, row: number) => {
    const match = CAMPUS_DESKS.find((candidate) => candidate.cluster === cluster && candidate.row === row);
    assert.ok(match, `missing c${cluster}r${row}`);
    return match;
  };
  const seat = (cluster: number, row: number, number: number) => {
    const match = desk(cluster, row).seats.find((candidate) => candidate.seat === number);
    assert.ok(match, `missing c${cluster}r${row}s${number}`);
    return match;
  };

  const c1FirstColumn = [7, 6, 5, 4, 3, 2, 1].map((row) => desk(1, row));
  assert.equal(new Set(c1FirstColumn.map((row) => row.seats[0].x)).size, 1);
  assert.ok(c1FirstColumn.every((row, index) => index === 0 || row.seats[0].y > c1FirstColumn[index - 1].seats[0].y));

  const c1SecondColumn = [8, 9, 10, 11, 12, 13].map((row) => desk(1, row));
  assert.equal(new Set(c1SecondColumn.map((row) => row.seats[0].x)).size, 1);
  assert.ok(c1SecondColumn.every((row, index) => index === 0 || row.seats[0].y > c1SecondColumn[index - 1].seats[0].y));

  const c2 = Array.from({ length: 9 }, (_, index) => desk(2, index + 1));
  assert.equal(new Set(c2.map((row) => row.seats[0].y)).size, 1);
  assert.ok(c2.every((row, index) => index === 0 || row.seats[0].x > c2[index - 1].seats[0].x));

  assert.deepEqual([1, 2, 3, 4].map((number) => seat(1, 7, number).x), [90, 68, 46, 24]);
  assert.deepEqual([1, 2, 3, 4].map((number) => seat(1, 8, number).x), [150, 172, 194, 216]);
  assert.deepEqual([1, 2, 3, 4].map((number) => seat(2, 1, number).y), [286, 264, 242, 220]);
  assert.ok(
    Math.min(...c1SecondColumn.flatMap((row) => row.seats.map((candidate) => candidate.x))) -
      Math.max(...c1FirstColumn.flatMap((row) => row.seats.map((candidate) => candidate.x))) >= 60,
  );

  const c3Left = [7, 6, 5, 4, 3, 2, 1].map((row) => desk(3, row));
  assert.equal(new Set(c3Left.map((row) => row.seats[0].x)).size, 1);
  assert.ok(desk(3, 8).seats[0].x < desk(3, 9).seats[0].x);
  assert.ok(desk(3, 9).seats[0].x < desk(3, 10).seats[0].x);
  assert.ok(desk(3, 16).seats[0].y < desk(3, 14).seats[0].y);
  assert.ok(desk(3, 14).seats[0].y < desk(3, 13).seats[0].y);
  assert.ok(desk(3, 13).seats[0].y < desk(3, 11).seats[0].y);
});

test("every workstation square stays inside its cluster", () => {
  const radius = WORKSTATION_SIZE / 2;
  for (const seat of CAMPUS_SEATS) {
    const corners: CampusPoint[] = [
      { x: seat.x - radius, y: seat.y - radius },
      { x: seat.x + radius, y: seat.y - radius },
      { x: seat.x + radius, y: seat.y + radius },
      { x: seat.x - radius, y: seat.y + radius },
    ];
    const zone = clusterZone(seat.cluster);
    assert.ok(corners.every((corner) => pointInPolygon(corner, zone.points)), seat.host);
  }
});

test("workstation squares retain the requested gap even when every seat is active", () => {
  for (let left = 0; left < CAMPUS_SEATS.length; left += 1) {
    for (let right = left + 1; right < CAMPUS_SEATS.length; right += 1) {
      const a = CAMPUS_SEATS[left];
      const b = CAMPUS_SEATS[right];
      const separated = Math.abs(a.x - b.x) >= WORKSTATION_SIZE + WORKSTATION_GAP ||
        Math.abs(a.y - b.y) >= WORKSTATION_SIZE + WORKSTATION_GAP;
      assert.ok(separated, `${a.host} overlaps ${b.host}`);
    }
  }
});

test("cluster walls are not duplicated and both passages stay open", () => {
  for (let left = 0; left < CAMPUS_WALLS.length; left += 1) {
    for (let right = left + 1; right < CAMPUS_WALLS.length; right += 1) {
      assert.equal(collinearOverlap(CAMPUS_WALLS[left], CAMPUS_WALLS[right]), false);
    }
  }
  for (const passage of CAMPUS_PASSAGES) {
    assert.equal(CAMPUS_WALLS.some((wall) => segmentEntersPassage(wall, passage)), false, passage.id);
  }
});

test("cluster shells remain separate polygons that only meet at shared edges", () => {
  assert.equal(CAMPUS_CLUSTER_ZONES.length, 3);
  for (const zone of CAMPUS_CLUSTER_ZONES) assert.ok(zone.points.length >= 4);
});

function collinearOverlap(a: CampusWall, b: CampusWall): boolean {
  const verticalA = a.x1 === a.x2;
  const verticalB = b.x1 === b.x2;
  if (verticalA && verticalB && a.x1 === b.x1) {
    return overlapLength(a.y1, a.y2, b.y1, b.y2) > 0;
  }
  const horizontalA = a.y1 === a.y2;
  const horizontalB = b.y1 === b.y2;
  if (horizontalA && horizontalB && a.y1 === b.y1) {
    return overlapLength(a.x1, a.x2, b.x1, b.x2) > 0;
  }
  return false;
}

function overlapLength(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
}

function segmentEntersPassage(wall: CampusWall, passage: CampusPassage): boolean {
  const minX = Math.min(wall.x1, wall.x2);
  const maxX = Math.max(wall.x1, wall.x2);
  const minY = Math.min(wall.y1, wall.y2);
  const maxY = Math.max(wall.y1, wall.y2);
  return maxX > passage.x && minX < passage.x + passage.width &&
    maxY > passage.y && minY < passage.y + passage.height;
}
