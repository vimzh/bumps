import { pointInPolygon } from './fit'
import {
  findElement,
  floorModelSchema,
  type FloorModel,
  type Furniture,
  type Opening,
  type Point,
  type Wall,
} from './schema'

// Deterministic structural analysis of a parsed floor model. Two jobs:
//
// 1. normalizeFloorModel — mechanical repairs that never need judgment:
//    weld near-miss wall junctions, snap openings onto their walls, drop
//    duplicate walls/openings, merge overlapping same-label furniture, and
//    cap furniture at the significance the plate can hold. Every fix here
//    is one the critique loop would otherwise spend a Gemini round on.
//
// 2. auditFloorModel — geometry-derived attention hints (door-width gaps
//    between aligned walls, sealed rooms, orphan openings). Code cannot see
//    the drawing, so these are never applied directly: they are handed to
//    the critique agent, which verifies each against the source image.

const WELD_MIN_PX = 6
const WELD_MAX_PX = 26
const DEGENERATE_WALL_PX = 1
// Blocks beyond this count cannot all be significant on one tactile plate.
export const FURNITURE_CAP = 14
const LANDMARK_LABEL =
  /column|counter|desk|reception|fountain|stage|shelv|kiosk|bar\b|island|bench|bed\b|planter/i

export type StructuralFindingKind =
  | 'gap-candidate'
  | 'sealed-room'
  | 'orphan-opening'
  | 'entrance-without-gate'
  | 'door-pair'
  | 'stair-treads'

export type StructuralFinding = {
  kind: StructuralFindingKind
  message: string
  at: Point
}

export type NormalizedFloorModel = {
  model: FloorModel
  notes: string[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function wallLength(wall: { a: Point; b: Point }): number {
  return distance(wall.a, wall.b)
}

/** Closest point on segment ab to p, with distance and clamped parameter. */
function pointSegment(
  p: Point,
  a: Point,
  b: Point,
): { d: number; point: Point; t: number } {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSq = abx * abx + aby * aby
  const t =
    lengthSq === 0
      ? 0
      : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq, 0, 1)
  const point = { x: a.x + t * abx, y: a.y + t * aby }
  return { d: distance(p, point), point, t }
}

function weldTolerance(a: Wall, b: Wall): number {
  const byThickness = clamp(0.9 * (a.thickness + b.thickness), WELD_MIN_PX, WELD_MAX_PX)
  // Chains of short segments (curve approximations) must not weld across a
  // member: keep the tolerance well below the shorter wall's own length.
  return Math.min(byThickness, 0.45 * Math.min(wallLength(a), wallLength(b)))
}

function clampPoint(point: Point, width: number, height: number): Point {
  return { x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) }
}

function polygonArea(polygon: Point[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

function boundsOf(polygon: Point[]): { x0: number; y0: number; x1: number; y1: number } {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  return {
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
  }
}

/** Straightens only four-corner shapes already within 10 degrees of a rectangle. */
export function orthogonalizeNearRectangle(polygon: Point[]): Point[] {
  if (polygon.length !== 4) return polygon
  const axes = polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!
    const angle = Math.atan2(Math.abs(next.y - point.y), Math.abs(next.x - point.x))
    const degrees = (angle * 180) / Math.PI
    if (degrees <= 10) return 'horizontal'
    if (degrees >= 80) return 'vertical'
    return null
  })
  if (
    axes.some((axis) => axis === null) ||
    axes.some((axis, index) => axis === axes[(index + 1) % axes.length])
  ) {
    return polygon
  }

  const { x0, x1, y0, y1 } = boundsOf(polygon)
  const center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
  const straightened = polygon.map((point) => ({
    x: point.x < center.x ? x0 : x1,
    y: point.y < center.y ? y0 : y1,
  }))
  if (new Set(straightened.map((point) => `${point.x},${point.y}`)).size !== 4) {
    return polygon
  }
  return straightened
}

function boundsOverlapArea(
  a: ReturnType<typeof boundsOf>,
  b: ReturnType<typeof boundsOf>,
): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

/** Andrew monotone-chain convex hull; input order does not matter. */
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p.x - q.x || p.y - q.y)
  if (sorted.length <= 3) return sorted
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: Point[] = []
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

type Endpoint = { end: 'a' | 'b'; wallIndex: number }

/** Welds wall endpoints that nearly meet (L/U corners and stub joins). */
function weldWallJunctions(walls: Wall[]): { walls: Wall[]; welds: number } {
  const endpoints: Endpoint[] = walls.flatMap((_, wallIndex) => [
    { end: 'a' as const, wallIndex },
    { end: 'b' as const, wallIndex },
  ])
  const positionOf = (endpoint: Endpoint, current: Wall[]): Point =>
    current[endpoint.wallIndex]![endpoint.end]

  // Union-find over endpoints of *different* walls within weld tolerance.
  const parent = endpoints.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!
      i = parent[i]!
    }
    return i
  }
  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      const a = endpoints[i]!
      const b = endpoints[j]!
      if (a.wallIndex === b.wallIndex) continue
      const tolerance = weldTolerance(walls[a.wallIndex]!, walls[b.wallIndex]!)
      const gap = distance(positionOf(a, walls), positionOf(b, walls))
      if (gap > 0 && gap <= tolerance) parent[find(j)] = find(i)
      else if (gap === 0) parent[find(j)] = find(i)
    }
  }

  const clusters = new Map<number, Endpoint[]>()
  endpoints.forEach((endpoint, i) => {
    const root = find(i)
    clusters.set(root, [...(clusters.get(root) ?? []), endpoint])
  })

  let welds = 0
  const next = walls.map((wall) => ({ ...wall, a: { ...wall.a }, b: { ...wall.b } }))
  for (const members of clusters.values()) {
    if (members.length < 2) continue
    const center = members.reduce(
      (acc, m) => {
        const p = positionOf(m, walls)
        return { x: acc.x + p.x / members.length, y: acc.y + p.y / members.length }
      },
      { x: 0, y: 0 },
    )
    const moved = members.some((m) => distance(positionOf(m, walls), center) > 0.01)
    if (!moved) continue
    welds += 1
    for (const m of members) next[m.wallIndex]![m.end] = { ...center }
  }

  // A weld must never destroy a wall: revert any segment it degenerated.
  for (let i = 0; i < next.length; i++) {
    if (wallLength(next[i]!) < DEGENERATE_WALL_PX) next[i] = walls[i]!
  }
  return { walls: next, welds }
}

/** Snaps dangling endpoints onto the interior of a crossing wall (T joins). */
function snapTeeJunctions(walls: Wall[]): { walls: Wall[]; snaps: number } {
  let snaps = 0
  const next = walls.map((wall) => ({ ...wall, a: { ...wall.a }, b: { ...wall.b } }))
  for (let i = 0; i < next.length; i++) {
    for (const end of ['a', 'b'] as const) {
      const endpoint = next[i]![end]
      let best: { d: number; point: Point } | null = null
      for (let j = 0; j < next.length; j++) {
        if (i === j) continue
        const other = next[j]!
        const hit = pointSegment(endpoint, other.a, other.b)
        // Interior only: endpoint-to-endpoint joins are the welder's job.
        if (hit.t < 0.05 || hit.t > 0.95) continue
        if (hit.d <= weldTolerance(next[i]!, other) && (!best || hit.d < best.d)) {
          best = hit
        }
      }
      if (best && best.d > 0.01) {
        const candidate = { ...next[i]!, [end]: best.point }
        if (wallLength(candidate) >= DEGENERATE_WALL_PX) {
          next[i] = candidate
          snaps += 1
        }
      }
    }
  }
  return { walls: next, snaps }
}

/** Drops walls duplicating an existing segment (double-traced geometry). */
function dedupeWalls(walls: Wall[]): { walls: Wall[]; dropped: number } {
  const kept: Wall[] = []
  let dropped = 0
  for (const wall of walls) {
    const duplicate = kept.findIndex((other) => {
      const tolerance = weldTolerance(wall, other)
      return (
        (distance(wall.a, other.a) <= tolerance && distance(wall.b, other.b) <= tolerance) ||
        (distance(wall.a, other.b) <= tolerance && distance(wall.b, other.a) <= tolerance)
      )
    })
    if (duplicate === -1) {
      kept.push(wall)
      continue
    }
    dropped += 1
    if (wall.confidence > kept[duplicate]!.confidence) kept[duplicate] = wall
  }
  return { dropped, walls: kept }
}

function openingAttachTolerance(wall: Wall): number {
  return Math.max(1.5 * wall.thickness, 14)
}

/**
 * Ensures every opening sits on the wall it interrupts: verifies stated
 * wallIds, finds walls for unattached openings, and snaps `at` onto the
 * wall centerline. Openings with no wall nearby keep wallId null (the
 * audit reports them for image verification).
 */
function attachOpenings(
  openings: Opening[],
  walls: Wall[],
): { attached: number; openings: Opening[] } {
  let attached = 0
  const next = openings.map((opening) => {
    const stated = walls.find((wall) => wall.id === opening.wallId)
    if (stated) {
      const hit = pointSegment(opening.at, stated.a, stated.b)
      if (hit.d <= openingAttachTolerance(stated)) {
        return hit.d > 0.01 ? { ...opening, at: hit.point } : opening
      }
    }
    let best: { d: number; point: Point; wall: Wall } | null = null
    for (const wall of walls) {
      const hit = pointSegment(opening.at, wall.a, wall.b)
      if (hit.d <= openingAttachTolerance(wall) && (!best || hit.d < best.d)) {
        best = { d: hit.d, point: hit.point, wall }
      }
    }
    if (!best) {
      return opening.wallId === null ? opening : { ...opening, wallId: null }
    }
    attached += 1
    return { ...opening, at: best.point, wallId: best.wall.id }
  })
  return { attached, openings: next }
}

/** Merges same-wall openings whose spans overlap (double-reported doors). */
function dedupeOpenings(openings: Opening[]): { dropped: number; openings: Opening[] } {
  const kept: Opening[] = []
  let dropped = 0
  for (const opening of openings) {
    const duplicate = kept.findIndex(
      (other) =>
        other.kind === opening.kind &&
        other.wallId !== null &&
        other.wallId === opening.wallId &&
        distance(other.at, opening.at) < 0.6 * ((other.width + opening.width) / 2),
    )
    if (duplicate === -1) {
      kept.push(opening)
      continue
    }
    dropped += 1
    if (opening.confidence > kept[duplicate]!.confidence) kept[duplicate] = opening
  }
  return { dropped, openings: kept }
}

/** Clubs overlapping same-label furniture into one block (convex hull). */
function mergeFurniture(furniture: Furniture[]): { furniture: Furniture[]; merges: number } {
  const items = furniture.map((item) => ({ ...item, polygon: [...item.polygon] }))
  let merges = 0
  let changed = true
  while (changed) {
    changed = false
    outer: for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!
        const b = items[j]!
        if (a.label.toLowerCase() !== b.label.toLowerCase()) continue
        const overlap = boundsOverlapArea(boundsOf(a.polygon), boundsOf(b.polygon))
        const smaller = Math.min(polygonArea(a.polygon), polygonArea(b.polygon))
        if (smaller === 0 || overlap / smaller < 0.35) continue
        items[i] = {
          ...a,
          confidence: Math.min(a.confidence, b.confidence),
          polygon: convexHull([...a.polygon, ...b.polygon]),
        }
        items.splice(j, 1)
        merges += 1
        changed = true
        break outer
      }
    }
  }
  return { furniture: items, merges }
}

/**
 * Keeps the most significant furniture when the parser over-extracts:
 * navigation landmarks always survive; the rest rank by drawn area.
 */
function capFurniture(furniture: Furniture[]): {
  dropped: Furniture[]
  furniture: Furniture[]
} {
  if (furniture.length <= FURNITURE_CAP) return { dropped: [], furniture }
  const ranked = [...furniture].sort((a, b) => {
    const landmark = Number(LANDMARK_LABEL.test(b.label)) - Number(LANDMARK_LABEL.test(a.label))
    if (landmark !== 0) return landmark
    return polygonArea(b.polygon) - polygonArea(a.polygon)
  })
  const keep = new Set(ranked.slice(0, FURNITURE_CAP).map((item) => item.id))
  return {
    dropped: furniture.filter((item) => !keep.has(item.id)),
    furniture: furniture.filter((item) => keep.has(item.id)),
  }
}

export function normalizeFloorModel(model: FloorModel): NormalizedFloorModel {
  const notes: string[] = []
  const { heightPx, widthPx } = model.plan

  const clampedWalls = model.walls
    .map((wall) => ({
      ...wall,
      a: clampPoint(wall.a, widthPx, heightPx),
      b: clampPoint(wall.b, widthPx, heightPx),
    }))
    .filter((wall) => wallLength(wall) >= DEGENERATE_WALL_PX)
  if (clampedWalls.length < model.walls.length) {
    notes.push(`dropped ${model.walls.length - clampedWalls.length} degenerate wall(s)`)
  }

  const welded = weldWallJunctions(clampedWalls)
  const teed = snapTeeJunctions(welded.walls)
  const deduped = dedupeWalls(teed.walls)
  if (welded.welds + teed.snaps > 0) {
    notes.push(`welded ${welded.welds + teed.snaps} wall junction(s)`)
  }
  if (deduped.dropped > 0) notes.push(`removed ${deduped.dropped} duplicate wall(s)`)

  const clampedOpenings = model.openings.map((opening) => ({
    ...opening,
    at: clampPoint(opening.at, widthPx, heightPx),
    wallId:
      opening.wallId !== null && deduped.walls.some((w) => w.id === opening.wallId)
        ? opening.wallId
        : null,
  }))
  const attached = attachOpenings(clampedOpenings, deduped.walls)
  const openings = dedupeOpenings(attached.openings)
  if (attached.attached > 0) {
    notes.push(`attached ${attached.attached} opening(s) to their wall`)
  }
  if (openings.dropped > 0) {
    notes.push(`removed ${openings.dropped} duplicate opening(s)`)
  }

  let straightenedFurniture = 0
  const furniture = (model.furniture ?? []).map((item) => {
    const polygon = orthogonalizeNearRectangle(item.polygon)
    const changed = polygon.some(
      (point, index) =>
        point.x !== item.polygon[index]!.x || point.y !== item.polygon[index]!.y,
    )
    if (changed) straightenedFurniture += 1
    return changed ? { ...item, polygon } : item
  })
  if (straightenedFurniture > 0) {
    notes.push(`straightened ${straightenedFurniture} near-rectangular furniture block(s)`)
  }
  const merged = mergeFurniture(furniture)
  const capped = capFurniture(merged.furniture)
  if (merged.merges > 0) {
    notes.push(`clubbed ${merged.merges} overlapping same-label furniture block(s)`)
  }
  if (capped.dropped.length > 0) {
    const labels = [...new Set(capped.dropped.map((item) => item.label))].slice(0, 6)
    notes.push(
      `dropped ${capped.dropped.length} low-significance furniture block(s) beyond the ${FURNITURE_CAP}-block cap (${labels.join(', ')})`,
    )
  }

  const normalized = floorModelSchema.parse({
    ...model,
    furniture: capped.furniture,
    openings: openings.openings,
    walls: deduped.walls,
  })
  return { model: normalized, notes }
}

const GAP_MAX_CANDIDATES = 8
const SEALED_MAX_FINDINGS = 6
const COLLINEAR_MAX_DEG = 10

function doorWidthRange(model: FloorModel): { max: number; min: number } {
  const widths = model.openings.map((o) => o.width).sort((a, b) => a - b)
  if (widths.length >= 3) {
    const median = widths[Math.floor(widths.length / 2)]!
    return { max: 3 * median, min: 0.4 * median }
  }
  const maxDim = Math.max(model.plan.widthPx, model.plan.heightPx)
  return { max: 0.06 * maxDim, min: 8 }
}

function round(point: Point): string {
  return `(${Math.round(point.x)}, ${Math.round(point.y)})`
}

/** Doorway-width gaps between aligned wall ends with no extracted opening. */
function findGapCandidates(model: FloorModel): StructuralFinding[] {
  const range = doorWidthRange(model)
  const candidates: { finding: StructuralFinding; gap: number }[] = []
  const walls = model.walls
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]!
      const b = walls[j]!
      const dirA = { x: a.b.x - a.a.x, y: a.b.y - a.a.y }
      const dirB = { x: b.b.x - b.a.x, y: b.b.y - b.a.y }
      const lengthA = Math.hypot(dirA.x, dirA.y)
      const lengthB = Math.hypot(dirB.x, dirB.y)
      if (lengthA === 0 || lengthB === 0) continue
      const cross = Math.abs(dirA.x * dirB.y - dirA.y * dirB.x) / (lengthA * lengthB)
      if (cross > Math.sin((COLLINEAR_MAX_DEG * Math.PI) / 180)) continue

      // Project both walls on A's axis; a facing gap means disjoint spans.
      const axis = { x: dirA.x / lengthA, y: dirA.y / lengthA }
      const project = (p: Point) => (p.x - a.a.x) * axis.x + (p.y - a.a.y) * axis.y
      const lateral = (p: Point) =>
        Math.abs((p.x - a.a.x) * -axis.y + (p.y - a.a.y) * axis.x)
      const alignTolerance = Math.max(a.thickness, b.thickness, 6)
      if (lateral(b.a) > alignTolerance || lateral(b.b) > alignTolerance) continue

      const [a0, a1] = [project(a.a), project(a.b)].sort((p, q) => p - q)
      const [b0, b1] = [project(b.a), project(b.b)].sort((p, q) => p - q)
      if (Math.min(a1, b1) > Math.max(a0, b0)) continue // overlapping, not facing
      const gap = a1 <= b0 ? b0 - a1 : a0 - b1
      if (gap < range.min || gap > range.max) continue

      const facingA = a1 <= b0 ? (project(a.a) === a1 ? a.a : a.b) : project(a.a) === a0 ? a.a : a.b
      const facingB = a1 <= b0 ? (project(b.a) === b0 ? b.a : b.b) : project(b.a) === b1 ? b.a : b.b
      const center = { x: (facingA.x + facingB.x) / 2, y: (facingA.y + facingB.y) / 2 }

      const covered = model.openings.some(
        (opening) => distance(opening.at, center) <= Math.max(gap, opening.width),
      )
      if (covered) continue
      // A third wall running through or bounding the gap means it is a
      // junction or corridor crossing, not a doorway.
      const blocked = walls.some(
        (other) =>
          other !== a &&
          other !== b &&
          pointSegment(center, other.a, other.b).d < gap / 2 + other.thickness,
      )
      if (blocked) continue

      candidates.push({
        finding: {
          at: center,
          kind: 'gap-candidate',
          message: `Walls ${a.id} and ${b.id} are aligned and face each other across a ~${Math.round(gap)}px gap at ${round(center)} with no extracted opening. If the source shows a door, archway, or open passage there, report a missing opening; if the source wall is continuous, the wall break itself is misplaced geometry.`,
        },
        gap,
      })
    }
  }
  return candidates
    .sort((p, q) => p.gap - q.gap)
    .slice(0, GAP_MAX_CANDIDATES)
    .map((c) => c.finding)
}

/**
 * Campus/site block-plans: labeled building footprints with few or no
 * walls render as raised blocks rather than walled rooms (mirrors the
 * tactile converter's decision).
 */
export function isBlockPlan(model: FloorModel): boolean {
  const labeledRooms = model.rooms.filter((room) => room.label).length
  return (
    labeledRooms > 0 &&
    (model.walls.length === 0 ||
      (labeledRooms >= 8 && model.walls.length <= labeledRooms / 4))
  )
}

/** Walled rooms with no opening or entrance anywhere on their boundary. */
function findSealedRooms(model: FloorModel): StructuralFinding[] {
  if (isBlockPlan(model)) return []
  const findings: StructuralFinding[] = []
  const boundaryTolerance = Math.max(
    14,
    0.01 * Math.max(model.plan.widthPx, model.plan.heightPx),
  )
  for (const room of model.rooms) {
    const edges = room.polygon.map((point, index) => ({
      a: point,
      b: room.polygon[(index + 1) % room.polygon.length]!,
    }))
    const nearBoundary = (p: Point, tolerance: number) =>
      edges.some((edge) => pointSegment(p, edge.a, edge.b).d <= tolerance)

    const walled = model.walls.some((wall) =>
      nearBoundary(
        { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 },
        Math.max(wall.thickness * 1.5, boundaryTolerance),
      ),
    )
    if (!walled) continue

    const hasOpening = model.openings.some((opening) =>
      nearBoundary(opening.at, Math.max(boundaryTolerance, opening.width)),
    )
    const hasEntranceFeature = model.features.some(
      (feature) =>
        (feature.kind === 'entrance' || feature.kind === 'exit') &&
        (pointInPolygon(feature.at, room.polygon) ||
          nearBoundary(feature.at, boundaryTolerance)),
    )
    if (hasOpening || hasEntranceFeature) continue
    const center = room.polygon.reduce(
      (acc, p) => ({
        x: acc.x + p.x / room.polygon.length,
        y: acc.y + p.y / room.polygon.length,
      }),
      { x: 0, y: 0 },
    )
    findings.push({
      at: center,
      kind: 'sealed-room',
      message: `Room ${room.id}${room.label ? ` "${room.label}"` : ''} has walls but no extracted opening or entrance on its boundary (center ${round(center)}). Re-inspect that boundary in the source for a door notation the extraction may have missed. If the source truly shows no opening, this is fine — do NOT invent one.`,
    })
    if (findings.length >= SEALED_MAX_FINDINGS) break
  }
  return findings
}

/** Openings that ended up on no extracted wall at all. */
function findOrphanOpenings(model: FloorModel): StructuralFinding[] {
  return model.openings
    .filter((opening) => {
      if (opening.wallId !== null) return false
      return !model.walls.some(
        (wall) =>
          pointSegment(opening.at, wall.a, wall.b).d <= openingAttachTolerance(wall),
      )
    })
    .map((opening) => ({
      at: opening.at,
      kind: 'orphan-opening' as const,
      message: `Opening ${opening.id} (${opening.kind}) at ${round(opening.at)} lies on no extracted wall. Either the wall it interrupts is missing from the model, or the opening itself is not real — check the source and report whichever is true.`,
    }))
}

/** Entrance/exit features whose gate has no opening in the nearby wall. */
function findEntrancesWithoutGates(model: FloorModel): StructuralFinding[] {
  const gateTolerance = Math.max(
    90,
    0.05 * Math.max(model.plan.widthPx, model.plan.heightPx),
  )
  return model.features
    .filter((feature) => feature.kind === 'entrance' || feature.kind === 'exit')
    .filter((feature) => {
      const nearWall = model.walls.some(
        (wall) =>
          pointSegment(feature.at, wall.a, wall.b).d <= gateTolerance,
      )
      if (!nearWall) return false
      return !model.openings.some(
        (opening) => distance(opening.at, feature.at) <= gateTolerance,
      )
    })
    .map((feature) => ({
      at: feature.at,
      kind: 'entrance-without-gate' as const,
      message: `${feature.kind === 'exit' ? 'Exit' : 'Entrance'} feature ${feature.id} at ${round(feature.at)} has no opening in any nearby wall. If the drawing shows the perimeter open or gapped at this arrow, a gate opening is missing from the model; if the arrow only points at a solid wall, this is fine.`,
    }))
}

/** Opening pairs so close together that one drawn door was likely doubled. */
function findDoorPairs(model: FloorModel): StructuralFinding[] {
  const findings: StructuralFinding[] = []
  const openings = model.openings
  for (let i = 0; i < openings.length; i++) {
    for (let j = i + 1; j < openings.length; j++) {
      const a = openings[i]!
      const b = openings[j]!
      const gap = distance(a.at, b.at)
      if (gap > 1.4 * Math.max(a.width, b.width)) continue
      if (a.wallId !== null && a.wallId === b.wallId) continue // same-wall dedupe handles these
      const center = {
        x: (a.at.x + b.at.x) / 2,
        y: (a.at.y + b.at.y) / 2,
      }
      findings.push({
        at: center,
        kind: 'door-pair',
        message: `Openings ${a.id} and ${b.id} are only ~${Math.round(gap)}px apart near ${round(center)}. Drawings rarely place two distinct doors this close: verify each against the source and report the one that is not drawn (or is drawn elsewhere) as extra/misplaced.`,
      })
      if (findings.length >= 4) return findings
    }
  }
  return findings
}

/** Clusters of short parallel evenly spaced walls: likely stair treads. */
function findStairTreadWalls(model: FloorModel): StructuralFinding[] {
  const maxTread = 0.06 * Math.max(model.plan.widthPx, model.plan.heightPx)
  const short = model.walls.filter((wall) => {
    const length = wallLength(wall)
    return length >= 8 && length <= maxTread
  })
  if (short.length < 4) return []
  const angleOf = (wall: Wall): number => {
    const angle = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x)
    return ((angle % Math.PI) + Math.PI) % Math.PI
  }
  const mid = (wall: Wall): Point => ({
    x: (wall.a.x + wall.b.x) / 2,
    y: (wall.a.y + wall.b.y) / 2,
  })
  const used = new Set<string>()
  const findings: StructuralFinding[] = []
  for (const seed of short) {
    if (used.has(seed.id)) continue
    const seedAngle = angleOf(seed)
    const cluster = short.filter((wall) => {
      if (used.has(wall.id)) return false
      const delta = Math.abs(angleOf(wall) - seedAngle)
      const parallel = Math.min(delta, Math.PI - delta) < (12 * Math.PI) / 180
      return (
        parallel &&
        distance(mid(wall), mid(seed)) <= 3.5 * Math.max(wallLength(seed), 30)
      )
    })
    if (cluster.length < 4) continue
    for (const wall of cluster) used.add(wall.id)
    const center = cluster.reduce(
      (acc, wall) => ({
        x: acc.x + mid(wall).x / cluster.length,
        y: acc.y + mid(wall).y / cluster.length,
      }),
      { x: 0, y: 0 },
    )
    findings.push({
      at: center,
      kind: 'stair-treads',
      message: `${cluster.length} short parallel wall segments cluster near ${round(center)} (${cluster.map((w) => w.id).join(', ')}). If the source draws a stair flight there, these are tread lines traced as walls: they should be removed and replaced by one stairs feature (keep only the flight's enclosing walls).`,
    })
    if (findings.length >= 3) break
  }
  return findings
}

/** Representative position of any element, for zooming and hints. */
export function elementPosition(model: FloorModel, id: string): Point | null {
  const element = findElement(model, id)
  if (!element) return null
  switch (element.kind) {
    case 'wall':
      return {
        x: (element.a.x + element.b.x) / 2,
        y: (element.a.y + element.b.y) / 2,
      }
    case 'door':
    case 'window':
      return element.at
    case 'room':
    case 'furniture':
      return element.polygon.reduce(
        (acc, p) => ({
          x: acc.x + p.x / element.polygon.length,
          y: acc.y + p.y / element.polygon.length,
        }),
        { x: 0, y: 0 },
      )
    case 'path':
    case 'road':
      return element.points[Math.floor(element.points.length / 2)] ?? null
    default:
      return element.at
  }
}

export function auditFloorModel(model: FloorModel): StructuralFinding[] {
  return [
    ...findGapCandidates(model),
    ...findSealedRooms(model),
    ...findOrphanOpenings(model),
    ...findEntrancesWithoutGates(model),
    ...findDoorPairs(model),
    ...findStairTreadWalls(model),
  ]
}
