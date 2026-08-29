import { textBrailleSize } from './braille'
import type { FloorModel, Point, Room, Wall } from './schema'
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
const WALL_WIDTH_MM = 2
const SYMBOL_SIZE_MM = 6

export type ConversionNote = {
  kind: 'dropped-wall' | 'dropped-window' | 'short-label'
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

// The plan-pixel -> plate-mm transform, shared by conversion and the
// validation-context builder so both always agree.
export function planToPlateTransform(model: FloorModel) {
  const bounds = contentBounds(model)
  const contentW = Math.max(1, bounds.maxX - bounds.minX)
  const contentH = Math.max(1, bounds.maxY - bounds.minY)
  const inner = PLATE.widthMm - 2 * PLATE.marginMm
  const mmPerPx = Math.min(inner / contentW, inner / contentH)
  const offsetX = PLATE.marginMm + (inner - contentW * mmPerPx) / 2
  const offsetY = PLATE.marginMm + (inner - contentH * mmPerPx) / 2
  const toMm = (p: Point): Point => ({
    x: (p.x - bounds.minX) * mmPerPx + offsetX,
    y: (p.y - bounds.minY) * mmPerPx + offsetY,
  })
  return { bounds, mmPerPx, offsetX, offsetY, toMm }
}

export function convertToTactile(model: FloorModel): ConversionResult {
  const notes: ConversionNote[] = []
  const { mmPerPx, toMm } = planToPlateTransform(model)

  const elements: TactileElement[] = []
  const legend: LegendEntry[] = []

  // Walls -> raised lines (drop sub-threshold fragments rather than shrink).
  for (const wall of model.walls) {
    const a = toMm(wall.a)
    const b = toMm(wall.b)
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y)
    if (lengthMm < MIN_WALL_LENGTH_MM) {
      notes.push({
        elementId: wall.id,
        kind: 'dropped-wall',
        message: `Wall ${wall.id} prints at ${lengthMm.toFixed(1)} mm and was dropped`,
      })
      continue
    }
    elements.push({
      heightMm: RELIEF_MM.wallLine,
      id: `t-${wall.id}`,
      kind: 'line',
      points: [a, b],
      sourceId: wall.id,
      widthMm: WALL_WIDTH_MM,
    })
  }

  // Doors -> threshold-bar symbols oriented along their wall; windows are
  // not navigation-relevant on a tactile map and are dropped with a note.
  for (const opening of model.openings) {
    if (opening.kind === 'window') {
      notes.push({
        elementId: opening.id,
        kind: 'dropped-window',
        message: `Window ${opening.id} omitted (not navigation-relevant)`,
      })
      continue
    }
    const wall = opening.wallId
      ? model.walls.find((w): w is Wall => w.id === opening.wallId)
      : undefined
    const rotation = wall
      ? (Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * 180) / Math.PI
      : 0
    elements.push({
      at: toMm(opening.at),
      heightMm: RELIEF_MM.pointSymbol,
      id: `t-${opening.id}`,
      kind: 'symbol',
      rotation,
      sizeMm: SYMBOL_SIZE_MM,
      sourceId: opening.id,
      symbol: 'door',
    })
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

  // Room labels -> braille keys at room centroids + legend entries.
  const labeledRooms = model.rooms.filter(
    (room): room is Room & { label: string } =>
      room.label !== null && sanitizeLabel(room.label).length > 0,
  )
  const keyByLabel = assignKeys(labeledRooms.map((room) => room.label))
  for (const room of labeledRooms) {
    const key = keyByLabel.get(room.label)!
    const at = toMm(centroid(room.polygon))
    const size = textBrailleSize(key)
    elements.push({
      // Center the key on the centroid.
      at: { x: at.x - size.widthMm / 2, y: at.y - size.heightMm / 2 },
      id: `t-label-${room.id}`,
      key,
      kind: 'braille',
      sourceId: room.id,
    })
    if (!legend.some((entry) => entry.key === key)) {
      legend.push({ key, text: sanitizeLabel(room.label) })
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

  const design: TactileDesign = {
    elements,
    legend,
    mmPerPx,
    plate: { ...PLATE },
    schemaVersion: 1,
    separateLegendPlate: legend.length > 4,
    title: model.title,
  }
  return { design, notes }
}
