import { Resvg } from '@resvg/resvg-js'
import * as mupdf from 'mupdf'
import { isBlockPlan, type FloorModel } from '@bumps/floor-model'

// Pixel-level completeness check, no model calls: rasterize the source
// plan's dark linework and subtract everything the extracted model
// accounts for (with generous dilation). Dense leftover regions are where
// the parser most likely missed structure. The result is advisory — text,
// dimension strings, and hatching also leave ink — so regions are handed
// to the critique agent as attention hints, never applied directly.

const ANALYSIS_WIDTH = 512
const SOURCE_INK_LUMINANCE = 118
const MODEL_INK_LUMINANCE = 128
const CELL_PX = 16
// A cell is suspicious when uncovered ink fills enough of it and most of
// that cell's ink is unaccounted for.
const CELL_UNCOVERED_SHARE = 0.05
const CELL_UNCOVERED_OF_INK = 0.5
const MAX_REGIONS = 5
// Plan-space dilation around extracted strokes: drawn symbols (door arcs,
// stair rungs) hug their element without being traced by it.
const PAD_PX = 12

export type CoverageRegion = {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type CoverageReport = {
  /** Share of the source's dark linework covered by extracted geometry. */
  coveredInkRatio: number
  regions: CoverageRegion[]
}

type Mask = { data: Uint8Array; height: number; width: number }

function sourceInkMask(bytes: Uint8Array, mimeType: string): Mask {
  const doc = mupdf.Document.openDocument(bytes, mimeType)
  try {
    const page = doc.loadPage(0)
    const [x0, , x1] = page.getBounds()
    const zoom = ANALYSIS_WIDTH / Math.max(1, x1 - x0)
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(zoom, zoom),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    )
    try {
      const pixels = pixmap.getPixels()
      const width = pixmap.getWidth()
      const height = pixmap.getHeight()
      const components = Math.max(1, Math.round(pixels.length / (width * height)))
      const data = new Uint8Array(width * height)
      for (let i = 0; i < width * height; i++) {
        const offset = i * components
        const luminance =
          components >= 3
            ? 0.299 * pixels[offset]! +
              0.587 * pixels[offset + 1]! +
              0.114 * pixels[offset + 2]!
            : pixels[offset]!
        data[i] = luminance < SOURCE_INK_LUMINANCE ? 1 : 0
      }
      return { data, height, width }
    } finally {
      pixmap.destroy()
      page.destroy()
    }
  } finally {
    doc.destroy()
  }
}

/** Everything the model accounts for, drawn fat so nearby symbol ink counts. */
function coverageSvg(model: FloorModel): string {
  const { heightPx, widthPx } = model.plan
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthPx} ${heightPx}" width="${widthPx}" height="${heightPx}">`,
    `<rect width="${widthPx}" height="${heightPx}" fill="white"/>`,
  ]
  const points = (list: { x: number; y: number }[]) =>
    list.map((p) => `${p.x},${p.y}`).join(' ')
  for (const road of model.roads ?? []) {
    parts.push(
      `<polyline points="${points(road.points)}" fill="none" stroke="black" stroke-width="${road.widthPx + PAD_PX}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
  }
  // Rooms cover source ink only on block-plans, where footprints become
  // raised blocks. On walled floor plans the room boundary must be covered
  // by extracted walls — a room outline standing in for a missed wall
  // would hide exactly the loss this check exists to catch.
  if (isBlockPlan(model)) {
    for (const room of model.rooms) {
      parts.push(
        `<polygon points="${points(room.polygon)}" fill="black" stroke="black" stroke-width="${PAD_PX}"/>`,
      )
    }
  }
  for (const item of model.furniture ?? []) {
    parts.push(
      `<polygon points="${points(item.polygon)}" fill="black" stroke="black" stroke-width="${PAD_PX}"/>`,
    )
  }
  for (const path of model.paths ?? []) {
    parts.push(
      `<polyline points="${points(path.points)}" fill="none" stroke="black" stroke-width="${PAD_PX + 4}" stroke-linecap="round"/>`,
    )
  }
  for (const wall of model.walls) {
    parts.push(
      `<line x1="${wall.a.x}" y1="${wall.a.y}" x2="${wall.b.x}" y2="${wall.b.y}" stroke="black" stroke-width="${wall.thickness + PAD_PX}" stroke-linecap="round"/>`,
    )
  }
  for (const opening of model.openings) {
    // Door leaves and swing arcs are drawn up to a door-width away from
    // the wall gap they belong to.
    parts.push(
      `<circle cx="${opening.at.x}" cy="${opening.at.y}" r="${opening.width + PAD_PX}" fill="black"/>`,
    )
  }
  for (const feature of model.features) {
    parts.push(
      `<rect x="${feature.at.x - 24}" y="${feature.at.y - 24}" width="48" height="48" fill="black"/>`,
    )
  }
  parts.push('</svg>')
  return parts.join('\n')
}

function modelInkMask(model: FloorModel, width: number): Mask {
  const rendered = new Resvg(coverageSvg(model), {
    fitTo: { mode: 'width', value: width },
  }).render()
  const pixels = rendered.pixels
  const data = new Uint8Array(rendered.width * rendered.height)
  for (let i = 0; i < data.length; i++) {
    const offset = i * 4
    const luminance =
      0.299 * pixels[offset]! + 0.587 * pixels[offset + 1]! + 0.114 * pixels[offset + 2]!
    data[i] = luminance < MODEL_INK_LUMINANCE ? 1 : 0
  }
  return { data, height: rendered.height, width: rendered.width }
}

/**
 * Compares the source plan's dark linework against the extracted model
 * and returns the densest uncovered regions (plan pixel space) plus the
 * overall covered-ink ratio.
 */
export function computeInkCoverage(
  planBytes: Uint8Array,
  mimeType: string,
  model: FloorModel,
): CoverageReport {
  const source = sourceInkMask(planBytes, mimeType)
  const covered = modelInkMask(model, source.width)
  const width = Math.min(source.width, covered.width)
  const height = Math.min(source.height, covered.height)

  const cols = Math.ceil(width / CELL_PX)
  const rows = Math.ceil(height / CELL_PX)
  const cellInk = new Float64Array(cols * rows)
  const cellUncovered = new Float64Array(cols * rows)
  let inkTotal = 0
  let coveredTotal = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!source.data[y * source.width + x]) continue
      inkTotal += 1
      const cell = Math.floor(y / CELL_PX) * cols + Math.floor(x / CELL_PX)
      cellInk[cell] += 1
      if (covered.data[y * covered.width + x]) coveredTotal += 1
      else cellUncovered[cell] += 1
    }
  }
  const coveredInkRatio = inkTotal === 0 ? 1 : coveredTotal / inkTotal

  const flagged = new Set<number>()
  for (let cell = 0; cell < cols * rows; cell++) {
    const uncovered = cellUncovered[cell]!
    if (
      uncovered / (CELL_PX * CELL_PX) >= CELL_UNCOVERED_SHARE &&
      uncovered >= CELL_UNCOVERED_OF_INK * cellInk[cell]!
    ) {
      flagged.add(cell)
    }
  }

  // Cluster flagged cells (4-neighborhood) into bounding regions.
  const scale = model.plan.widthPx / width
  const clusters: { mass: number; region: CoverageRegion }[] = []
  const seen = new Set<number>()
  for (const start of flagged) {
    if (seen.has(start)) continue
    const queue = [start]
    seen.add(start)
    let mass = 0
    let cx0 = cols
    let cy0 = rows
    let cx1 = -1
    let cy1 = -1
    while (queue.length > 0) {
      const cell = queue.pop()!
      const col = cell % cols
      const row = Math.floor(cell / cols)
      mass += cellUncovered[cell]!
      cx0 = Math.min(cx0, col)
      cy0 = Math.min(cy0, row)
      cx1 = Math.max(cx1, col)
      cy1 = Math.max(cy1, row)
      for (const next of [cell - 1, cell + 1, cell - cols, cell + cols]) {
        if (seen.has(next) || !flagged.has(next)) continue
        const nextCol = next % cols
        if (Math.abs(nextCol - col) > 1) continue // row wrap
        seen.add(next)
        queue.push(next)
      }
    }
    clusters.push({
      mass,
      region: {
        x0: Math.round(cx0 * CELL_PX * scale),
        x1: Math.round(Math.min((cx1 + 1) * CELL_PX, width) * scale),
        y0: Math.round(cy0 * CELL_PX * scale),
        y1: Math.round(Math.min((cy1 + 1) * CELL_PX, height) * scale),
      },
    })
  }
  clusters.sort((a, b) => b.mass - a.mass)
  return {
    coveredInkRatio,
    regions: clusters.slice(0, MAX_REGIONS).map((c) => c.region),
  }
}
