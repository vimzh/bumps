import {
  fitRectInPolygon,
  orthogonalizeNearRectangle,
  type Point,
} from "@bumps/floor-model";

export const WALL_ANGLE_STEP_DEGREES = 45;

type PlanBounds = { height: number; width: number };
type WallSegment = { a: Point; b: Point; id: string };

export type WallOpeningDraft = {
  at: Point;
  end: Point;
  start: Point;
  wallId: string;
  width: number;
};

export function snapValue(
  value: number,
  gridStep: number,
  offset = 0
): number {
  return Math.round((value - offset) / gridStep) * gridStep + offset;
}

export function snapPoint(
  point: Point,
  gridStep: number,
  bounds?: PlanBounds,
  origin: Point = { x: 0, y: 0 }
): Point {
  const snapped = {
    x: snapValue(point.x, gridStep, origin.x),
    y: snapValue(point.y, gridStep, origin.y),
  };
  if (!bounds) return snapped;
  const minX = origin.x + Math.ceil(-origin.x / gridStep) * gridStep;
  const minY = origin.y + Math.ceil(-origin.y / gridStep) * gridStep;
  const maxX =
    origin.x + Math.floor((bounds.width - origin.x) / gridStep) * gridStep;
  const maxY =
    origin.y + Math.floor((bounds.height - origin.y) / gridStep) * gridStep;
  return {
    x: Math.min(maxX, Math.max(minX, snapped.x)),
    y: Math.min(maxY, Math.max(minY, snapped.y)),
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function dominantOffset(values: number[], gridStep: number): number {
  if (values.length === 0) return 0;
  const resolution = Math.max(1, gridStep / 20);
  const bucketCount = Math.max(1, Math.round(gridStep / resolution));
  const counts = new Map<number, number>();
  for (const value of values) {
    const bucket =
      Math.round(positiveModulo(value, gridStep) / resolution) % bucketCount;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let winner = 0;
  let winnerCount = -1;
  for (const [bucket, count] of counts) {
    if (count > winnerCount) {
      winner = bucket;
      winnerCount = count;
    }
  }
  return winner * resolution;
}

export function gridOriginForWalls(
  walls: WallSegment[],
  gridStep: number
): Point {
  const vertical = walls
    .filter(
      (wall) =>
        Math.abs(wall.b.x - wall.a.x) <=
        Math.abs(wall.b.y - wall.a.y) * 0.2
    )
    .map((wall) => (wall.a.x + wall.b.x) / 2);
  const horizontal = walls
    .filter(
      (wall) =>
        Math.abs(wall.b.y - wall.a.y) <=
        Math.abs(wall.b.x - wall.a.x) * 0.2
    )
    .map((wall) => (wall.a.y + wall.b.y) / 2);
  return {
    x: dominantOffset(
      vertical.length > 0
        ? vertical
        : walls.flatMap((wall) => [wall.a.x, wall.b.x]),
      gridStep
    ),
    y: dominantOffset(
      horizontal.length > 0
        ? horizontal
        : walls.flatMap((wall) => [wall.a.y, wall.b.y]),
      gridStep
    ),
  };
}

export function gridOriginForWall(
  base: Point,
  wall: WallSegment,
  gridStep: number
): Point {
  const dx = Math.abs(wall.b.x - wall.a.x);
  const dy = Math.abs(wall.b.y - wall.a.y);
  return dx >= dy
    ? {
        ...base,
        y: positiveModulo((wall.a.y + wall.b.y) / 2, gridStep),
      }
    : {
        ...base,
        x: positiveModulo((wall.a.x + wall.b.x) / 2, gridStep),
      };
}

// Walls use the eight compass directions. This keeps common 90-degree
// geometry effortless while still allowing deliberate 45-degree walls.
export function constrainWallEnd(
  start: Point,
  candidate: Point,
  gridStep: number,
  bounds?: PlanBounds,
  gridOrigin: Point = { x: 0, y: 0 },
  preserveStart = false
): Point {
  const origin = preserveStart
    ? start
    : snapPoint(start, gridStep, bounds, gridOrigin);
  const localOrigin = preserveStart ? origin : gridOrigin;
  const snapped = snapPoint(candidate, gridStep, bounds, localOrigin);
  const dx = snapped.x - origin.x;
  const dy = snapped.y - origin.y;
  if (dx === 0 && dy === 0) return snapped;

  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const direction = ((sector % 8) + 8) % 8;
  let distance = snapValue(Math.max(Math.abs(dx), Math.abs(dy)), gridStep);
  const signX = direction === 3 || direction === 4 || direction === 5 ? -1 : 1;
  const signY = direction === 5 || direction === 6 || direction === 7 ? -1 : 1;

  if (bounds) {
    const availableX = Math.floor(
      (signX > 0 ? bounds.width - origin.x : origin.x) / gridStep
    ) * gridStep;
    const availableY = Math.floor(
      (signY > 0 ? bounds.height - origin.y : origin.y) / gridStep
    ) * gridStep;
    if (direction === 0 || direction === 4) distance = Math.min(distance, availableX);
    else if (direction === 2 || direction === 6) distance = Math.min(distance, availableY);
    else distance = Math.min(distance, availableX, availableY);
  }

  if (direction === 0 || direction === 4) {
    return { x: origin.x + signX * distance, y: origin.y };
  }
  if (direction === 2 || direction === 6) {
    return { x: origin.x, y: origin.y + signY * distance };
  }
  return {
    x: origin.x + signX * distance,
    y: origin.y + signY * distance,
  };
}

export function wallAngleDegrees(start: Point, end: Point): number {
  const degrees = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
  return ((Math.round(degrees) % 180) + 180) % 180;
}

export function resizePolygonEdge(
  points: Point[],
  edgeIndex: number,
  delta: Point,
  gridStep: number,
  bounds?: PlanBounds,
  gridOrigin: Point = { x: 0, y: 0 }
): Point[] {
  const editable = orthogonalizeNearRectangle(points);
  const nextIndex = (edgeIndex + 1) % editable.length;
  const start = editable[edgeIndex];
  const end = editable[nextIndex];
  if (!start || !end) return points;

  const edgeX = end.x - start.x;
  const edgeY = end.y - start.y;
  const length = Math.hypot(edgeX, edgeY);
  if (length === 0) return points;

  const normal = { x: -edgeY / length, y: edgeX / length };
  const distance = delta.x * normal.x + delta.y * normal.y;
  const shift = {
    x: snapValue(normal.x * distance, gridStep),
    y: snapValue(normal.y * distance, gridStep),
  };

  return editable.map((point, index) =>
    index === edgeIndex || index === nextIndex
      ? snapPoint(
          { x: point.x + shift.x, y: point.y + shift.y },
          gridStep,
          bounds,
          gridOrigin
        )
      : point
  );
}

export function resizePolygonVertex(
  points: Point[],
  vertexIndex: number,
  candidate: Point,
  gridStep: number,
  bounds?: PlanBounds,
  gridOrigin: Point = { x: 0, y: 0 }
): Point[] {
  const rectangle = orthogonalizeNearRectangle(points);
  const moved = rectangle[vertexIndex];
  if (rectangle === points || !moved) {
    return points.map((point, index) =>
      index === vertexIndex
        ? snapPoint(candidate, gridStep, bounds, gridOrigin)
        : point
    );
  }

  const fixed = rectangle[(vertexIndex + 2) % rectangle.length]!;
  const snapped = snapPoint(candidate, gridStep, bounds, gridOrigin);
  return rectangle.map((point) => ({
    x: point.x === moved.x ? snapped.x : fixed.x,
    y: point.y === moved.y ? snapped.y : fixed.y,
  }));
}

function pointOnSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
              lengthSquared
          )
        );
  const projected = { x: start.x + dx * t, y: start.y + dy * t };
  return {
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
    point: projected,
    t,
  };
}

export function nearestWall<T extends WallSegment>(
  point: Point,
  walls: T[],
  maxDistance: number
): { point: Point; wall: T } | null {
  let nearest: { distance: number; point: Point; wall: T } | null = null;
  for (const wall of walls) {
    const hit = pointOnSegment(point, wall.a, wall.b);
    if (hit.distance <= maxDistance && (!nearest || hit.distance < nearest.distance)) {
      nearest = { ...hit, wall };
    }
  }
  return nearest ? { point: nearest.point, wall: nearest.wall } : null;
}

export function wallOpeningFromDrag(
  wall: WallSegment,
  start: Point,
  candidate: Point,
  gridStep: number
): WallOpeningDraft {
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const startDistance = pointOnSegment(start, wall.a, wall.b).t * length;
  const candidateDistance = pointOnSegment(candidate, wall.a, wall.b).t * length;
  const direction = candidateDistance < startDistance ? -1 : 1;
  const width = Math.min(
    direction > 0 ? length - startDistance : startDistance,
    snapValue(Math.abs(candidateDistance - startDistance), gridStep)
  );
  const endDistance = startDistance + direction * width;
  const pointAt = (distance: number): Point => {
    const t = length === 0 ? 0 : distance / length;
    return {
      x: wall.a.x + (wall.b.x - wall.a.x) * t,
      y: wall.a.y + (wall.b.y - wall.a.y) * t,
    };
  };
  const projectedStart = pointAt(startDistance);
  const end = pointAt(endDistance);
  return {
    at: {
      x: (projectedStart.x + end.x) / 2,
      y: (projectedStart.y + end.y) / 2,
    },
    end,
    start: projectedStart,
    wallId: wall.id,
    width,
  };
}

export function wallOpeningSpan(
  wall: WallSegment,
  opening: { at: Point; width: number }
): [Point, Point] {
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const center = pointOnSegment(opening.at, wall.a, wall.b).t * length;
  const startDistance = Math.max(0, center - opening.width / 2);
  const endDistance = Math.min(length, center + opening.width / 2);
  const pointAt = (distance: number): Point => {
    const t = length === 0 ? 0 : distance / length;
    return {
      x: wall.a.x + (wall.b.x - wall.a.x) * t,
      y: wall.a.y + (wall.b.y - wall.a.y) * t,
    };
  };
  return [pointAt(startDistance), pointAt(endDistance)];
}

export function polygonArea(points: Point[]): number {
  return Math.abs(
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function orientation(a: Point, b: Point, c: Point): number {
  return Math.sign((b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y));
}

function onSegment(a: Point, b: Point, point: Point): boolean {
  return (
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (
    (abC === 0 && onSegment(a, b, c)) ||
    (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) ||
    (cdB === 0 && onSegment(c, d, b))
  );
}

export function polygonSelfIntersects(points: Point[]): boolean {
  for (let first = 0; first < points.length; first++) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second++) {
      const secondNext = (second + 1) % points.length;
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first;
      if (adjacent) continue;
      if (
        segmentsIntersect(
          points[first]!,
          points[firstNext]!,
          points[second]!,
          points[secondNext]!
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

export function fitEditorLabel(
  polygon: Point[],
  label: string,
  fontSize: number,
  preferred: Point
): { point: Point; text: string } | null {
  const candidates = [
    label,
    label.length > 3 ? `${label.slice(0, 2)}…` : label,
    label.slice(0, 1),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  for (const text of candidates) {
    const width = fontSize * (text.length * 0.62 + 0.5);
    const point = fitRectInPolygon(width, fontSize * 1.25, polygon, preferred);
    if (point) return { point, text };
  }
  return null;
}
