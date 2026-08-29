import type { Point } from './schema'

// Placement search for axis-aligned rectangles (braille keys) inside
// arbitrary room polygons. Bounding-box tests lie for thin diagonal
// halls — a sliver's bbox can dwarf the key while the polygon can never
// contain it — so both the converter and the validator use this search
// as the single source of truth for "can the key sit inside?".

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function rectInsidePolygon(
  cx: number,
  cy: number,
  width: number,
  height: number,
  polygon: Point[],
): boolean {
  const hw = width / 2
  const hh = height / 2
  // Corners, edge midpoints, and center: enough probes to reject any
  // polygon edge cutting through a key-sized rect.
  const probes: Point[] = [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
    { x: cx, y: cy - hh },
    { x: cx, y: cy + hh },
    { x: cx - hw, y: cy },
    { x: cx + hw, y: cy },
    { x: cx, y: cy },
  ]
  return probes.every((p) => pointInPolygon(p, polygon))
}

const SAMPLES_PER_AXIS = 14

/**
 * Finds a center position where a width×height rect fits entirely inside
 * the polygon, preferring positions near `prefer` (usually the centroid).
 * Returns null when no sampled position fits.
 */
export function fitRectInPolygon(
  width: number,
  height: number,
  polygon: Point[],
  prefer: Point,
): Point | null {
  if (rectInsidePolygon(prefer.x, prefer.y, width, height, polygon)) {
    return prefer
  }
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const minX = Math.min(...xs) + width / 2
  const maxX = Math.max(...xs) - width / 2
  const minY = Math.min(...ys) + height / 2
  const maxY = Math.max(...ys) - height / 2
  if (minX > maxX || minY > maxY) return null
  const candidates: Point[] = []
  for (let i = 0; i <= SAMPLES_PER_AXIS; i++) {
    for (let j = 0; j <= SAMPLES_PER_AXIS; j++) {
      candidates.push({
        x: minX + ((maxX - minX) * i) / SAMPLES_PER_AXIS,
        y: minY + ((maxY - minY) * j) / SAMPLES_PER_AXIS,
      })
    }
  }
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - prefer.x, a.y - prefer.y) -
      Math.hypot(b.x - prefer.x, b.y - prefer.y),
  )
  for (const candidate of candidates) {
    if (rectInsidePolygon(candidate.x, candidate.y, width, height, polygon)) {
      return candidate
    }
  }
  return null
}

/**
 * Up to `count` spatially diverse center positions where the rect fits
 * inside the polygon, nearest-to-`prefer` first. Used to relocate a
 * label anywhere legal in its room/block when its current spot conflicts.
 */
export function fitPositionsInPolygon(
  width: number,
  height: number,
  polygon: Point[],
  prefer: Point,
  count: number,
): Point[] {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  const minX = Math.min(...xs) + width / 2
  const maxX = Math.max(...xs) - width / 2
  const minY = Math.min(...ys) + height / 2
  const maxY = Math.max(...ys) - height / 2
  if (minX > maxX || minY > maxY) return []
  const fitting: Point[] = []
  for (let i = 0; i <= SAMPLES_PER_AXIS; i++) {
    for (let j = 0; j <= SAMPLES_PER_AXIS; j++) {
      const candidate = {
        x: minX + ((maxX - minX) * i) / SAMPLES_PER_AXIS,
        y: minY + ((maxY - minY) * j) / SAMPLES_PER_AXIS,
      }
      if (rectInsidePolygon(candidate.x, candidate.y, width, height, polygon)) {
        fitting.push(candidate)
      }
    }
  }
  fitting.sort(
    (a, b) =>
      Math.hypot(a.x - prefer.x, a.y - prefer.y) -
      Math.hypot(b.x - prefer.x, b.y - prefer.y),
  )
  const picked: Point[] = []
  const minSpread = Math.max(2, width / 2)
  for (const candidate of fitting) {
    if (picked.length >= count) break
    if (
      picked.every(
        (p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) >= minSpread,
      )
    ) {
      picked.push(candidate)
    }
  }
  return picked
}

/**
 * Center position for a label placed just outside a polygon that cannot
 * hold it — the adjacent-label convention on real tactile maps. Placed
 * below the polygon's bbox center, `gap` mm away.
 */
export function adjacentRectPosition(
  width: number,
  height: number,
  polygon: Point[],
  gap: number,
): Point {
  const xs = polygon.map((p) => p.x)
  const ys = polygon.map((p) => p.y)
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: Math.max(...ys) + gap + height / 2,
  }
}
