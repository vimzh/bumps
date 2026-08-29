import { textBrailleSize } from './braille'
import type { FloorModel, Point } from './schema'
import { planToPlateTransform } from './tactile-convert'
import type {
  BrailleLabel,
  TactileDesign,
  TactileLine,
  TactileSymbol,
  ValidationViolation,
} from './tactile'

// Deterministic standards validator (Phase 8). Every rule from the standards
// table in docs/idea.md, measured in plate millimeters. Violations are hard
// fails: the design must reach zero before export.

export const CLEARANCE_MM = 3
export const SIMILAR_SYMBOL_CLEARANCE_MM = 6
export const MIN_SYMBOL_MM = 5
export const MIN_DOOR_OPENING_MM = 5

// Rules layout iteration can fix by moving braille/symbols; 'scale' cannot.
export const MOVABLE_RULES = ['clearance', 'label-fit', 'margin'] as const

export type ValidationContext = {
  // Scaled room polygons (mm), for the label-fit rule.
  roomsMm: { id: string; polygonMm: Point[] }[]
  // Scaled door opening widths (mm), for the legibility gate.
  doorOpeningsMm: { id: string; widthMm: number }[]
}

export function buildValidationContext(model: FloorModel): ValidationContext {
  const { mmPerPx, toMm } = planToPlateTransform(model)
  return {
    doorOpeningsMm: model.openings
      .filter((o) => o.kind === 'door')
      .map((o) => ({ id: o.id, widthMm: o.width * mmPerPx })),
    roomsMm: model.rooms.map((room) => ({
      id: room.id,
      polygonMm: room.polygon.map(toMm),
    })),
  }
}

type Rect = { maxX: number; maxY: number; minX: number; minY: number }

function brailleRect(label: BrailleLabel): Rect {
  const size = textBrailleSize(label.key)
  return {
    maxX: label.at.x + size.widthMm,
    maxY: label.at.y + size.heightMm,
    minX: label.at.x,
    minY: label.at.y,
  }
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
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

function distPointSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSq = abx * abx + aby * aby
  const t =
    lengthSq === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq),
        )
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

function distPointRect(p: Point, r: Rect): number {
  const dx = Math.max(r.minX - p.x, 0, p.x - r.maxX)
  const dy = Math.max(r.minY - p.y, 0, p.y - r.maxY)
  return Math.hypot(dx, dy)
}

function rectCorners(r: Rect): Point[] {
  return [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ]
}

function rectRectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(a.minX - b.maxX, 0, b.minX - a.maxX)
  const dy = Math.max(a.minY - b.maxY, 0, b.minY - a.maxY)
  return Math.hypot(dx, dy)
}

// Approximate rect <-> segment distance via corners and endpoints.
function rectSegmentDistance(r: Rect, a: Point, b: Point): number {
  const cornerToSeg = Math.min(
    ...rectCorners(r).map((c) => distPointSegment(c, a, b)),
  )
  const endToRect = Math.min(distPointRect(a, r), distPointRect(b, r))
  return Math.min(cornerToSeg, endToRect)
}

function lineSegments(line: TactileLine): [Point, Point][] {
  const segments: [Point, Point][] = []
  for (let i = 0; i < line.points.length - 1; i++) {
    segments.push([line.points[i]!, line.points[i + 1]!])
  }
  return segments
}

function symbolLineDistance(symbol: TactileSymbol, line: TactileLine): number {
  const min = Math.min(
    ...lineSegments(line).map(([a, b]) => distPointSegment(symbol.at, a, b)),
  )
  return min - symbol.sizeMm / 2 - line.widthMm / 2
}

function brailleLineDistance(label: BrailleLabel, line: TactileLine): number {
  const rect = brailleRect(label)
  const min = Math.min(
    ...lineSegments(line).map(([a, b]) => rectSegmentDistance(rect, a, b)),
  )
  return min - line.widthMm / 2
}

export function validateTactileDesign(
  design: TactileDesign,
  context: ValidationContext,
): ValidationViolation[] {
  const violations: ValidationViolation[] = []
  const { heightMm, marginMm, widthMm } = design.plate
  const symbols = design.elements.filter(
    (e): e is TactileSymbol => e.kind === 'symbol',
  )
  const labels = design.elements.filter(
    (e): e is BrailleLabel => e.kind === 'braille',
  )
  const lines = design.elements.filter(
    (e): e is TactileLine => e.kind === 'line',
  )

  // Legibility gate: unfixable by layout — the floor is too big for the plate.
  for (const door of context.doorOpeningsMm) {
    if (door.widthMm < MIN_DOOR_OPENING_MM) {
      violations.push({
        elementIds: [door.id],
        measuredMm: door.widthMm,
        message: `Door ${door.id} prints at ${door.widthMm.toFixed(1)} mm — floor too large for one plate; split it or simplify`,
        requiredMm: MIN_DOOR_OPENING_MM,
        rule: 'scale',
      })
    }
  }

  // Plate margins.
  const inMargin = (r: Rect) =>
    r.minX >= marginMm &&
    r.minY >= marginMm &&
    r.maxX <= widthMm - marginMm &&
    r.maxY <= heightMm - marginMm
  for (const symbol of symbols) {
    const half = symbol.sizeMm / 2
    if (
      !inMargin({
        maxX: symbol.at.x + half,
        maxY: symbol.at.y + half,
        minX: symbol.at.x - half,
        minY: symbol.at.y - half,
      })
    ) {
      violations.push({
        elementIds: [symbol.id],
        measuredMm: null,
        message: `Symbol ${symbol.id} lies outside the plate margin`,
        requiredMm: marginMm,
        rule: 'margin',
      })
    }
  }
  for (const label of labels) {
    if (!inMargin(brailleRect(label))) {
      violations.push({
        elementIds: [label.id],
        measuredMm: null,
        message: `Braille ${label.id} lies outside the plate margin`,
        requiredMm: marginMm,
        rule: 'margin',
      })
    }
  }

  // Minimum symbol size.
  for (const symbol of symbols) {
    if (symbol.sizeMm < MIN_SYMBOL_MM) {
      violations.push({
        elementIds: [symbol.id],
        measuredMm: symbol.sizeMm,
        message: `Symbol ${symbol.id} is ${symbol.sizeMm.toFixed(1)} mm — below the ${MIN_SYMBOL_MM} mm minimum`,
        requiredMm: MIN_SYMBOL_MM,
        rule: 'symbol-size',
      })
    }
  }

  // Pairwise clearance.
  const pushClearance = (
    aId: string,
    bId: string,
    measured: number,
    required: number,
  ) => {
    if (measured < required) {
      violations.push({
        elementIds: [aId, bId],
        measuredMm: Math.max(0, measured),
        message: `${aId} and ${bId} are ${Math.max(0, measured).toFixed(1)} mm apart — minimum is ${required} mm`,
        requiredMm: required,
        rule: 'clearance',
      })
    }
  }
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const a = symbols[i]!
      const b = symbols[j]!
      const gap =
        Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) -
        a.sizeMm / 2 -
        b.sizeMm / 2
      const required =
        a.symbol === b.symbol ? SIMILAR_SYMBOL_CLEARANCE_MM : CLEARANCE_MM
      pushClearance(a.id, b.id, gap, required)
    }
  }
  for (const symbol of symbols) {
    for (const label of labels) {
      const gap =
        distPointRect(symbol.at, brailleRect(label)) - symbol.sizeMm / 2
      pushClearance(symbol.id, label.id, gap, CLEARANCE_MM)
    }
  }
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const gap = rectRectDistance(
        brailleRect(labels[i]!),
        brailleRect(labels[j]!),
      )
      pushClearance(labels[i]!.id, labels[j]!.id, gap, CLEARANCE_MM)
    }
  }
  for (const label of labels) {
    for (const line of lines) {
      pushClearance(
        label.id,
        line.id,
        brailleLineDistance(label, line),
        CLEARANCE_MM,
      )
    }
  }
  for (const symbol of symbols) {
    // Door thresholds intentionally sit on their wall.
    if (symbol.symbol === 'door') continue
    for (const line of lines) {
      pushClearance(
        symbol.id,
        line.id,
        symbolLineDistance(symbol, line),
        CLEARANCE_MM,
      )
    }
  }

  // Label-fit: a room's braille key must sit inside that room.
  const roomById = new Map(context.roomsMm.map((room) => [room.id, room]))
  for (const label of labels) {
    if (!label.sourceId) continue
    const room = roomById.get(label.sourceId)
    if (!room) continue
    const rect = brailleRect(label)
    const fits = rectCorners(rect).every((corner) =>
      pointInPolygon(corner, room.polygonMm),
    )
    if (!fits) {
      violations.push({
        elementIds: [label.id],
        measuredMm: null,
        message: `Braille key for room ${label.sourceId} does not fit inside the room`,
        requiredMm: null,
        rule: 'label-fit',
      })
    }
  }

  return violations
}
