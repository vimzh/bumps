import { textBrailleSize } from './braille'
import { adjacentRectPosition, fitRectInPolygon } from './fit'
import type { FloorModel, Point, Room, Wall } from './schema'
import { orthogonalizeNearRectangle } from './structure'
import {
  RELIEF_MM,
  type LegendEntry,
  type TactileDesign,
  type TactileElement,
} from './tactile'

// Deterministic floor model -> tactile design conversion (Phase 7).
// No AI here: every rule from the standards table is enforced in code.

export const PLATE = { baseMm: 3, heightMm: 200, marginMm: 10, widthMm: 200 } as const

// Features and walls below these print sizes are dropped, not shrunk.
const MIN_WALL_LENGTH_MM = 3
const JUNCTION_TOLERANCE_MM = 1
const MIN_FURNITURE_SIZE_MM = 5
const WALL_WIDTH_MM = 2
const SYMBOL_SIZE_MM = 6
// Doorways read as gaps in the wall line (standard tactile practice);
// a gap must be wide enough for a fingertip to find it.
const MIN_DOOR_GAP_MM = 6

export type ConversionNote = {
  kind:
    | 'dropped-wall'
    | 'dropped-furniture'
    | 'dropped-furniture-label'
    | 'dropped-window'
    | 'multi-plate'
    | 'room-block'
    | 'short-label'
  elementId: string
  message: string
}

export type ConversionResult = {
  design: TactileDesign
  notes: ConversionNote[]
}

function contentBounds(model: FloorModel) {
  const points: Point[] = []
  for (const wall of model.walls) points.push(wall.a, wall.b)
  for (const room of model.rooms) points.push(...room.polygon)
  for (const opening of model.openings) points.push(opening.at)
  for (const feature of model.features) points.push(feature.at)
  for (const item of model.furniture) points.push(...item.polygon)
  for (const path of model.paths ?? []) points.push(...path.points)
  for (const road of model.roads ?? []) {
    const half = road.widthPx / 2
    for (const point of road.points) {
      points.push(
        { x: point.x - half, y: point.y - half },
        { x: point.x + half, y: point.y + half },
      )
    }
  }
  if (points.length === 0) {
    return { maxX: model.plan.widthPx, maxY: model.plan.heightPx, minX: 0, minY: 0 }
  }
  return {
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
  }
}

function distPointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSq = abx * abx + aby * aby
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq))
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

// How far (plan px) a door center may sit from a wall and still belong to it.
function candidateThreshold(wall: Wall): number {
  return Math.max(1.5 * wall.thickness, 14)
}

function centroid(polygon: Point[]): Point {
  const sum = polygon.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  )
  return { x: sum.x / polygon.length, y: sum.y / polygon.length }
}

function sanitizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
}

function isNavigationalLabel(label: string): boolean {
  const clean = sanitizeLabel(label)
  return (
    clean.length > 0 &&
    !/^\d+\s*(?:sf|sq\s*ft|square\s*feet)$/.test(clean)
  )
}

// 1-2 character braille keys, unique per design: first letters of words,
// then first two letters, then letter+digit fallbacks.
export function assignKeys(labels: string[]): Map<string, string> {
  const keys = new Map<string, string>()
  const used = new Set<string>()
  for (const label of labels) {
    const clean = sanitizeLabel(label)
    const words = clean.split(/\s+/).filter(Boolean)
    const candidates: string[] = []
    if (words.length >= 2) {
      candidates.push(words[0]![0]! + words[1]![0]!)
    }
    if (words[0]) {
      candidates.push(words[0].slice(0, 2), words[0]![0]!)
    }
    for (let digit = 2; digit <= 9; digit++) {
      if (words[0]) candidates.push(words[0]![0]! + String(digit))
    }
    const key = candidates.find((c) => c.length > 0 && !used.has(c)) ?? `x${used.size}`
    used.add(key)
    keys.set(label, key)
  }
  return keys
}

// The plan-pixel -> composite-mm transform for a given plate grid.
function layoutForGrid(model: FloorModel, rows: number, cols: number) {
  const bounds = contentBounds(model)
  const contentW = Math.max(1, bounds.maxX - bounds.minX)
  const contentH = Math.max(1, bounds.maxY - bounds.minY)
  // Margins apply only at the assembled map's outer border; seams between
  // plates are continuous.
  const innerW = PLATE.widthMm * cols - 2 * PLATE.marginMm
  const innerH = PLATE.heightMm * rows - 2 * PLATE.marginMm
  const mmPerPx = Math.min(innerW / contentW, innerH / contentH)
  const offsetX = PLATE.marginMm + (innerW - contentW * mmPerPx) / 2
  const offsetY = PLATE.marginMm + (innerH - contentH * mmPerPx) / 2
  const toMm = (p: Point): Point => ({
    x: (p.x - bounds.minX) * mmPerPx + offsetX,
    y: (p.y - bounds.minY) * mmPerPx + offsetY,
  })
  return { bounds, cols, mmPerPx, offsetX, offsetY, rows, toMm }
}

export type ScaleRequirement = {
  id: string
  label: string
  requiredMm: number
  widthPx: number
}

function rendersRoomsAsBlocks(model: FloorModel, labeledRoomCount: number): boolean {
  return (
    labeledRoomCount > 0 &&
    (model.walls.length === 0 ||
      (labeledRoomCount >= 8 && model.walls.length <= labeledRoomCount / 4))
  )
}

// Source features whose width must survive scaling. Door openings govern
// floor plans; road bands and building footprints govern wall-less site maps.
export function scaleRequirements(model: FloorModel): ScaleRequirement[] {
  const requirements: ScaleRequirement[] = model.openings
    .filter((opening) => opening.kind === 'door')
    .map((door) => ({
      id: door.id,
      label: 'Door',
      requiredMm: 5,
      widthPx: door.width,
    }))
  for (const road of model.roads ?? []) {
    requirements.push({
      id: road.id,
      label: 'Road',
      requiredMm: 3,
      widthPx: road.widthPx,
    })
  }
  const labeledRooms = model.rooms.filter(
    (room) => room.label !== null && isNavigationalLabel(room.label),
  )
  if (rendersRoomsAsBlocks(model, labeledRooms.length)) {
    for (const room of labeledRooms) {
      const xs = room.polygon.map((point) => point.x)
      const ys = room.polygon.map((point) => point.y)
      requirements.push({
        id: room.id,
        label: 'Building footprint',
        requiredMm: 5,
        widthPx: Math.min(
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
        ),
      })
    }
  }
  return requirements
}

// Deciding step: the smallest plate grid whose scale keeps navigation-critical
// source widths finger-readable. There is no user choice
// here on purpose — anything smaller is unreadable, anything larger wasteful.
export function planToPlateTransform(model: FloorModel) {
  const bounds = contentBounds(model)
  const contentW = Math.max(1, bounds.maxX - bounds.minX)
  const contentH = Math.max(1, bounds.maxY - bounds.minY)
  const contentAspect = contentW / contentH
  // Try every grid up to 4x4, fewest physical plates first. For equal
  // plate counts, prefer the assembled aspect closest to the plan.
  const candidates = Array.from({ length: 16 }, (_, index) => {
    const rows = Math.floor(index / 4) + 1
    const cols = (index % 4) + 1
    return [rows, cols] as const
  }).sort((a, b) => {
    const plateCount = a[0] * a[1] - b[0] * b[1]
    if (plateCount !== 0) return plateCount
    const aspectError = (grid: readonly [number, number]) =>
      Math.abs(Math.log(grid[1] / grid[0] / contentAspect))
    return aspectError(a) - aspectError(b)
  })
  const requirements = scaleRequirements(model)
  for (const [rows, cols] of candidates) {
    const layout = layoutForGrid(model, rows, cols)
    if (
      requirements.every(
        (requirement) =>
          requirement.widthPx * layout.mmPerPx >= requirement.requiredMm,
      )
    ) {
      return layout
    }
  }
  // Even 4x4 is too small: return the max grid and let the validator's
  // scale gate fail the design loudly.
  return layoutForGrid(model, 4, 4)
}

export function convertToTactile(model: FloorModel): ConversionResult {
  const notes: ConversionNote[] = []
  const { cols, mmPerPx, rows, toMm } = planToPlateTransform(model)
  if (rows * cols > 1) {
    notes.push({
      elementId: 'plate-grid',
      kind: 'multi-plate',
      message: `Floor is large: fitting on ${rows * cols} plates (${cols}×${rows} of ${PLATE.widthMm}×${PLATE.heightMm} mm)`,
    })
  }

  const elements: TactileElement[] = []
  const legend: LegendEntry[] = []
  const tactileFurniture = model.furniture.map((item) => ({
    ...item,
    polygon: orthogonalizeNearRectangle(item.polygon),
  })).filter((item) => {
    const polygon = item.polygon.map(toMm)
    const width =
      Math.max(...polygon.map((point) => point.x)) -
      Math.min(...polygon.map((point) => point.x))
    const height =
      Math.max(...polygon.map((point) => point.y)) -
      Math.min(...polygon.map((point) => point.y))
    if (Math.min(width, height) >= MIN_FURNITURE_SIZE_MM) return true
    notes.push({
      elementId: item.id,
      kind: 'dropped-furniture',
      message: `Furniture ${item.id} is smaller than ${MIN_FURNITURE_SIZE_MM} mm and was dropped`,
    })
    return false
  })

  const wallsMm = model.walls.map((wall) => ({
    a: toMm(wall.a),
    b: toMm(wall.b),
    id: wall.id,
  }))
  const junctionWallIds = new Set<string>()
  // ponytail: O(n²) junction scan; use a spatial index if real plans approach 2,000 walls.
  for (const wall of wallsMm) {
    for (const other of wallsMm) {
      if (wall.id === other.id) continue
      if (
        distPointToSegment(wall.a, other.a, other.b) <= JUNCTION_TOLERANCE_MM ||
        distPointToSegment(wall.b, other.a, other.b) <= JUNCTION_TOLERANCE_MM
      ) {
        junctionWallIds.add(wall.id)
        break
      }
    }
  }

  // Associate every door with a wall: declared wallId first, else the
  // nearest wall the door actually sits on.
  const doors = model.openings.filter((o) => o.kind === 'door')
  const doorsByWall = new Map<string, typeof doors>()
  for (const door of doors) {
    let wall = door.wallId
      ? model.walls.find((w): w is Wall => w.id === door.wallId)
      : undefined
    if (!wall) {
      let best = Number.POSITIVE_INFINITY
      for (const candidate of model.walls) {
        const d = distPointToSegment(door.at, candidate.a, candidate.b)
        if (d < best) {
          best = d
          wall = candidate
        }
      }
      // Only adopt a wall the door is plausibly on.
      if (wall && best > candidateThreshold(wall)) wall = undefined
    }
    if (wall) {
      const list = doorsByWall.get(wall.id) ?? []
      list.push(door)
      doorsByWall.set(wall.id, list)
    }
  }

  // Walls -> raised lines with a GAP at every doorway (standard tactile
  // practice: a break in the wall line reads as "door here"). Sub-threshold
  // fragments are dropped rather than shrunk.
  for (const wall of model.walls) {
    const a = toMm(wall.a)
    const b = toMm(wall.b)
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y)
    const preservesJunction = junctionWallIds.has(wall.id)
    if (lengthMm < MIN_WALL_LENGTH_MM && !preservesJunction) {
      notes.push({
        elementId: wall.id,
        kind: 'dropped-wall',
        message: `Wall ${wall.id} prints at ${lengthMm.toFixed(1)} mm and was dropped`,
      })
      continue
    }
    const ux = (b.x - a.x) / lengthMm
    const uy = (b.y - a.y) / lengthMm
    // Door positions as [start, end] intervals along the wall axis (mm).
    const gaps = (doorsByWall.get(wall.id) ?? [])
      .map((door) => {
        const at = toMm(door.at)
        const s = (at.x - a.x) * ux + (at.y - a.y) * uy
        const half = Math.max(door.width * mmPerPx, MIN_DOOR_GAP_MM) / 2
        return [Math.max(0, s - half), Math.min(lengthMm, s + half)] as const
      })
      .filter(([s0, s1]) => s1 > 0 && s0 < lengthMm)
      .sort((g, h) => g[0] - h[0])
    let cursor = 0
    let segment = 0
    const pushSegment = (from: number, to: number) => {
      if (to - from <= 0.01) return
      const touchesJunctionEnd =
        preservesJunction && (from <= 0.01 || to >= lengthMm - 0.01)
      if (to - from < MIN_WALL_LENGTH_MM && !touchesJunctionEnd) return
      segment += 1
      elements.push({
        heightMm: RELIEF_MM.wallLine,
        id: segment === 1 ? `t-${wall.id}` : `t-${wall.id}-s${segment}`,
        kind: 'line',
      style: 'solid',
        points: [
          { x: a.x + ux * from, y: a.y + uy * from },
          { x: a.x + ux * to, y: a.y + uy * to },
        ],
        sourceId: wall.id,
        widthMm: WALL_WIDTH_MM,
      })
    }
    for (const [s0, s1] of gaps) {
      pushSegment(cursor, s0)
      cursor = Math.max(cursor, s1)
    }
    pushSegment(cursor, lengthMm)
  }

  // Windows are not navigation-relevant on a tactile map: dropped with a note.
  for (const opening of model.openings) {
    if (opening.kind === 'window') {
      notes.push({
        elementId: opening.id,
        kind: 'dropped-window',
        message: `Window ${opening.id} omitted (not navigation-relevant)`,
      })
    }
  }

  // Features -> standardized point symbols.
  for (const feature of model.features) {
    elements.push({
      at: toMm(feature.at),
      heightMm: RELIEF_MM.pointSymbol,
      id: `t-${feature.id}`,
      kind: 'symbol',
      rotation: feature.rotation,
      sizeMm: SYMBOL_SIZE_MM,
      sourceId: feature.id,
      symbol: feature.kind,
    })
  }

  // Roads / streets -> smooth low-relief bands (the PSU-model
  // convention: streets as flat strips distinct from walls and paths).
  // Each segment is one quad area; joints get a square patch.
  const roadLabelPositions: { label: string; at: { x: number; y: number }; id: string }[] = []
  for (const road of model.roads ?? []) {
    const widthMm = Math.max(3, road.widthPx * mmPerPx)
    const pts = road.points.map(toMm)
    let longest = { a: pts[0]!, b: pts[1]!, len: 0 }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!
      const b = pts[i + 1]!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      if (len === 0) continue
      if (len > longest.len) longest = { a, b, len }
      const nx = (-dy / len) * (widthMm / 2)
      const ny = (dx / len) * (widthMm / 2)
      elements.push({
        heightMm: RELIEF_MM.areaTexture,
        id: `t-${road.id}-b${i}`,
        kind: 'area',
        polygon: [
          { x: a.x + nx, y: a.y + ny },
          { x: a.x - nx, y: a.y - ny },
          { x: b.x - nx, y: b.y - ny },
          { x: b.x + nx, y: b.y + ny },
        ],
        sourceId: road.id,
        texture: 'solid',
      })
      if (i > 0) {
        const half = widthMm / 2
        elements.push({
          heightMm: RELIEF_MM.areaTexture,
          id: `t-${road.id}-j${i}`,
          kind: 'area',
          polygon: [
            { x: a.x - half, y: a.y - half },
            { x: a.x + half, y: a.y - half },
            { x: a.x + half, y: a.y + half },
            { x: a.x - half, y: a.y + half },
          ],
          sourceId: road.id,
          texture: 'solid',
        })
      }
    }
    const label = road.label ? sanitizeLabel(road.label) : ''
    if (label.length > 0) {
      roadLabelPositions.push({
        at: {
          x: (longest.a.x + longest.b.x) / 2,
          y: (longest.a.y + longest.b.y) / 2,
        },
        id: road.id,
        label,
      })
    }
  }

  // Guide paths / walkways -> dashed raised lines (BANA broken-line
  // convention: distinct by touch from walls at the same height).
  for (const path of model.paths ?? []) {
    elements.push({
      heightMm: RELIEF_MM.wallLine,
      id: `t-${path.id}`,
      kind: 'line',
      points: path.points.map(toMm),
      sourceId: path.id,
      style: 'dashed',
      widthMm: 1.5,
    })
  }

  // Room labels -> braille keys at room centroids + legend entries.
  // Furniture labels share the same key space; same-label blocks (a row of
  // clubbed "chairs") share one key and one legend entry.
  const labeledRooms = model.rooms.filter(
    (room): room is Room & { label: string } =>
      room.label !== null && isNavigationalLabel(room.label),
  )
  const furnitureLabels = [
    ...new Set(
      tactileFurniture
        .map((item) => sanitizeLabel(item.label))
        .filter((label) => label.length > 0),
    ),
  ]
  const keyByLabel = assignKeys([
    ...labeledRooms.map((room) => room.label),
    ...furnitureLabels,
    ...roadLabelPositions.map((road) => road.label),
  ])
  // A plan with no walls (campus/site block-plans) would otherwise emit
  // nothing but floating keys; real tactile campus maps render buildings
  // as raised blocks, so we do too. Many labeled rooms with almost no
  // walls is the same situation with a few stray parsed segments.
  const roomsAsBlocks = rendersRoomsAsBlocks(model, labeledRooms.length)
  if (roomsAsBlocks) {
    for (const room of labeledRooms) {
      elements.push({
        heightMm: RELIEF_MM.areaTexture,
        id: `t-room-${room.id}`,
        kind: 'area',
        polygon: room.polygon.map(toMm),
        sourceId: room.id,
        texture: 'solid',
      })
    }
    notes.push({
      elementId: labeledRooms[0]!.id,
      kind: 'room-block',
      message: `No walls in this plan: rendering ${labeledRooms.length} building footprints as raised blocks`,
    })
  }

  for (const room of labeledRooms) {
    const key = keyByLabel.get(room.label)!
    const size = textBrailleSize(key)
    // Search for a spot fully inside the room; thin diagonal halls that
    // can never hold their key get an adjacent label just below instead.
    const polygonMm = room.polygon.map(toMm)
    const center =
      fitRectInPolygon(
        size.widthMm,
        size.heightMm,
        polygonMm,
        toMm(centroid(room.polygon)),
      ) ?? adjacentRectPosition(size.widthMm, size.heightMm, polygonMm, 4.5)
    elements.push({
      at: { x: center.x - size.widthMm / 2, y: center.y - size.heightMm / 2 },
      id: `t-label-${room.id}`,
      key,
      kind: 'braille',
      sourceId: room.id,
    })
    if (!legend.some((entry) => entry.key === key)) {
      legend.push({ key, text: sanitizeLabel(room.label) })
    }
  }

  // Furniture -> low-relief solid blocks, height-differentiated from walls,
  // with the braille key on the block when it fits.
  for (const item of tactileFurniture) {
    const polygonMm = item.polygon.map(toMm)
    elements.push({
      heightMm: RELIEF_MM.areaTexture,
      id: `t-${item.id}`,
      kind: 'area',
      polygon: polygonMm,
      sourceId: item.id,
      texture: 'solid',
    })
    const label = sanitizeLabel(item.label)
    const key = keyByLabel.get(label)
    if (!key) continue
    const size = textBrailleSize(key)
    const center = fitRectInPolygon(
      size.widthMm,
      size.heightMm,
      polygonMm,
      centroid(polygonMm),
    )
    if (!center) {
      notes.push({
        elementId: item.id,
        kind: 'dropped-furniture-label',
        message: `Furniture ${item.id} cannot contain its braille key, so the key was omitted`,
      })
      continue
    }
    elements.push({
      at: { x: center.x - size.widthMm / 2, y: center.y - size.heightMm / 2 },
      id: `t-label-${item.id}`,
      key,
      kind: 'braille',
      sourceId: item.id,
    })
    if (!legend.some((entry) => entry.key === key)) {
      legend.push({ key, text: label })
    }
  }

  // Street-name keys sit beside the band's midpoint (bands are usually
  // too narrow to hold braille), like street labels on the PSU model.
  for (const road of roadLabelPositions) {
    const key = keyByLabel.get(road.label)
    if (!key) continue
    const size = textBrailleSize(key)
    elements.push({
      at: {
        x: road.at.x - size.widthMm / 2,
        y: road.at.y - size.heightMm - 3.5,
      },
      id: `t-label-${road.id}`,
      key,
      kind: 'braille',
      sourceId: road.id,
    })
    if (!legend.some((entry) => entry.key === key)) {
      legend.push({ key, text: road.label })
    }
  }

  // The you-are-here marker gets its braille key next to the symbol.
  const marker = model.features.find((f) => f.kind === 'you-are-here')
  if (marker) {
    const key = legend.some((e) => e.key === 'yh') ? 'y2' : 'yh'
    const at = toMm(marker.at)
    elements.push({
      at: { x: at.x + SYMBOL_SIZE_MM, y: at.y - SYMBOL_SIZE_MM },
      id: `t-label-${marker.id}`,
      key,
      kind: 'braille',
      sourceId: marker.id,
    })
    legend.push({ key, text: 'you are here' })
  }

  // North arrow: real installed maps carry one whenever orientation is
  // known. Bottom-right corner inside the margin; rotation = plan.north.
  if (model.plan.north !== null) {
    const compositeW = PLATE.widthMm * cols
    const compositeH = PLATE.heightMm * rows
    elements.push({
      at: {
        x: compositeW - PLATE.marginMm - SYMBOL_SIZE_MM,
        y: compositeH - PLATE.marginMm - SYMBOL_SIZE_MM,
      },
      heightMm: RELIEF_MM.pointSymbol,
      id: 't-north',
      kind: 'symbol',
      rotation: model.plan.north,
      sizeMm: SYMBOL_SIZE_MM + 2,
      sourceId: null,
      symbol: 'north',
    })
  }

  // Braille title in the top margin band — the header zone real plates
  // use — where it cannot collide with map content. On multi-plate grids
  // it must fit the FIRST plate (a braille run split across a seam is
  // gibberish), so trim trailing words until it fits; skip if none fit.
  let titleText = model.title ? sanitizeLabel(model.title) : ''
  if (titleText.length > 0) {
    const titleMaxW =
      (cols > 1 ? PLATE.widthMm - 4 : PLATE.widthMm * cols) -
      2 * PLATE.marginMm
    while (titleText.length > 0 && textBrailleSize(titleText).widthMm > titleMaxW) {
      const cut = titleText.lastIndexOf(' ')
      titleText = cut > 0 ? titleText.slice(0, cut) : ''
    }
    if (titleText.length > 0) {
      const titleSize = textBrailleSize(titleText)
      elements.push({
        at: {
          x: PLATE.marginMm,
          y: Math.max(1.2, (PLATE.marginMm - titleSize.heightMm) / 2),
        },
        id: 't-title',
        key: titleText,
        kind: 'braille',
        sourceId: null,
      })
    }
  }

  const design: TactileDesign = {
    elements,
    grid: { cols, rows },
    legend,
    mmPerPx,
    plate: { ...PLATE },
    schemaVersion: 1,
    separateLegendPlate: legend.length > 4,
    title: model.title,
  }
  return { design, notes }
}
