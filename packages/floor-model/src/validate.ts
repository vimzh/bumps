import { textBrailleSize } from './braille'
import { fitPositionsInPolygon, pointInPolygon } from './fit'
import type { FloorModel, Point } from './schema'
import { planToPlateTransform } from './tactile-convert'
import {
  compositeSize,
  type BrailleLabel,
  type TactileArea,
  type TactileDesign,
  type TactileLine,
  type TactileSymbol,
  type ValidationViolation,
} from './tactile'

// Deterministic standards validator (Phase 8). Every rule from the standards
// table in docs/idea.md, measured in plate millimeters. Violations are hard
// fails: the design must reach zero before export.

export const CLEARANCE_MM = 3
export const SIMILAR_SYMBOL_CLEARANCE_MM = 6
export const MIN_SYMBOL_MM = 5
export const MIN_DOOR_OPENING_MM = 5

// Rules layout iteration can fix by moving braille/symbols; 'scale' cannot.
export const MOVABLE_RULES = [
  'clearance',
  'label-fit',
  'margin',
  'seam-clearance',
] as const
export const SEAM_CLEARANCE_MM = 3
// Float tolerance for all mm comparisons, and the adjacency budget for
// keys labeling features too small to hold them.
const MEASURE_EPS_MM = 0.05
export const ADJACENT_LABEL_MM = 10

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
  const { marginMm } = design.plate
  const { heightMm, widthMm } = compositeSize(design)
  const grid = design.grid ?? { cols: 1, rows: 1 }
  const symbols = design.elements.filter(
    (e): e is TactileSymbol => e.kind === 'symbol',
  )
  const labels = design.elements.filter(
    (e): e is BrailleLabel => e.kind === 'braille',
  )
  const lines = design.elements.filter(
    (e): e is TactileLine => e.kind === 'line',
  )
  const areas = design.elements.filter(
    (e): e is TactileArea => e.kind === 'area',
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
    // The plate title lives in the top margin band by design (the
    // header zone on real plates); content margins do not apply to it.
    if (label.id === 't-title') continue
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
  for (const area of areas) {
    const xs = area.polygon.map((p) => p.x)
    const ys = area.polygon.map((p) => p.y)
    if (
      !inMargin({
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
        minX: Math.min(...xs),
        minY: Math.min(...ys),
      })
    ) {
      violations.push({
        elementIds: [area.id],
        measuredMm: null,
        message: `Block ${area.id} lies outside the plate margin`,
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
    // Float tolerance: 2.9999 of scaled geometry is a met 3 mm rule.
    if (measured < required - MEASURE_EPS_MM) {
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
    // Door thresholds sit on their wall by definition; entrance/exit
    // arrows and entrance ramps mark boundary crossings, and real maps
    // (Muckenthaler, QMH) draw them touching the boundary line.
    if (
      symbol.symbol === 'door' ||
      symbol.symbol === 'entrance' ||
      symbol.symbol === 'exit' ||
      symbol.symbol === 'ramp'
    ) {
      continue
    }
    for (const line of lines) {
      pushClearance(
        symbol.id,
        line.id,
        symbolLineDistance(symbol, line),
        CLEARANCE_MM,
      )
    }
  }

  // Seam clearance: braille and point symbols must never straddle (or
  // crowd) the joints between plates — a split braille cell is gibberish.
  // Walls and areas may cross seams; they slice cleanly.
  const seamsX = grid.cols > 1 ? [design.plate.widthMm] : []
  const seamsY = grid.rows > 1 ? [design.plate.heightMm] : []
  const seamViolation = (id: string, measured: number) => {
    violations.push({
      elementIds: [id],
      measuredMm: Math.max(0, measured),
      message: `${id} is ${Math.max(0, measured).toFixed(1)} mm from a plate seam — keep braille and symbols at least ${SEAM_CLEARANCE_MM} mm clear`,
      requiredMm: SEAM_CLEARANCE_MM,
      rule: 'seam-clearance',
    })
  }
  for (const label of labels) {
    const rect = brailleRect(label)
    for (const sx of seamsX) {
      const d = rect.minX < sx && rect.maxX > sx ? 0 : Math.min(Math.abs(rect.minX - sx), Math.abs(rect.maxX - sx))
      if (d < SEAM_CLEARANCE_MM - MEASURE_EPS_MM) seamViolation(label.id, d)
    }
    for (const sy of seamsY) {
      const d = rect.minY < sy && rect.maxY > sy ? 0 : Math.min(Math.abs(rect.minY - sy), Math.abs(rect.maxY - sy))
      if (d < SEAM_CLEARANCE_MM - MEASURE_EPS_MM) seamViolation(label.id, d)
    }
  }
  for (const symbol of symbols) {
    for (const sx of seamsX) {
      const d = Math.abs(symbol.at.x - sx) - symbol.sizeMm / 2
      if (d < SEAM_CLEARANCE_MM - MEASURE_EPS_MM) seamViolation(symbol.id, d)
    }
    for (const sy of seamsY) {
      const d = Math.abs(symbol.at.y - sy) - symbol.sizeMm / 2
      if (d < SEAM_CLEARANCE_MM - MEASURE_EPS_MM) seamViolation(symbol.id, d)
    }
  }

  // Label-fit: a room's braille key must sit inside that room, and a
  // block's key inside its block. (Note: braille on a block is exempt from
  // block clearance by construction — height differentiation separates them.)
  const roomById = new Map(context.roomsMm.map((room) => [room.id, room]))
  const areaBySource = new Map(
    areas.filter((a) => a.sourceId).map((a) => [a.sourceId!, a]),
  )
  for (const label of labels) {
    if (!label.sourceId) continue
    const rect = brailleRect(label)
    const room = roomById.get(label.sourceId)
    const area = areaBySource.get(label.sourceId)
    const polygon = area?.polygon ?? room?.polygonMm
    if (!polygon) continue
    const fits = rectCorners(rect).every((corner) =>
      pointInPolygon(corner, polygon),
    )
    if (fits) continue
    // A feature that can never hold its key (too small, or a thin
    // diagonal sliver whose bbox is deceptively large) takes an adjacent
    // label instead — the convention on real tactile maps.
    const xs = polygon.map((p) => p.x)
    const ys = polygon.map((p) => p.y)
    const bounds = {
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
      minX: Math.min(...xs),
      minY: Math.min(...ys),
    }
    const keyW = rect.maxX - rect.minX
    const keyH = rect.maxY - rect.minY
    const canEverFit = fitPositionsInPolygon(
      keyW + 1,
      keyH + 1,
      polygon,
      { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
      40,
    ).some((center) => {
      const candidate: Rect = {
        maxX: center.x + keyW / 2,
        maxY: center.y + keyH / 2,
        minX: center.x - keyW / 2,
        minY: center.y - keyH / 2,
      }
      return lines.every(
        (line) =>
          Math.min(
            ...lineSegments(line).map(([a, b]) =>
              rectSegmentDistance(candidate, a, b),
            ),
          ) -
            line.widthMm / 2 >=
          CLEARANCE_MM - MEASURE_EPS_MM,
      )
    })
    if (!canEverFit) {
      const gap = rectRectDistance(rect, bounds)
      if (gap <= ADJACENT_LABEL_MM + MEASURE_EPS_MM) continue
      violations.push({
        elementIds: [label.id],
        measuredMm: gap,
        message: `Braille key for ${label.sourceId} is ${gap.toFixed(1)} mm away — it is too small to label inside, so keep the key within ${ADJACENT_LABEL_MM} mm of it`,
        requiredMm: ADJACENT_LABEL_MM,
        rule: 'label-fit',
      })
      continue
    }
    violations.push({
      elementIds: [label.id],
      measuredMm: null,
      message: area
        ? `Braille key for block ${label.sourceId} does not fit inside the block`
        : `Braille key for room ${label.sourceId} does not fit inside the room`,
      requiredMm: null,
      rule: 'label-fit',
    })
  }

  return violations
}
