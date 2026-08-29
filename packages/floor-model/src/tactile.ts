import { z } from 'zod'
import { featureKinds, pointSchema } from './schema'

// The tactile design is the output of Phase 7's deterministic conversion:
// the floor model scaled to the plate, symbolized, and labeled. All
// coordinates are in millimeters on the plate, origin top-left. The STL
// generator extrudes exactly this document; the validator checks exactly
// this document. Heights follow the standards table in docs/idea.md.

export const RELIEF_MM = {
  areaTexture: 0.5,
  brailleDot: 0.7,
  pointSymbol: 1.5,
  wallLine: 1.0,
} as const

export const plateSchema = z.object({
  widthMm: z.number().positive().default(200),
  heightMm: z.number().positive().default(200),
  baseMm: z.number().positive().default(3),
  marginMm: z.number().nonnegative().default(10),
})

// A raised polyline with rectangular cross-section. Walls are solid;
// guide paths are dashed (BANA broken-line convention).
export const tactileLineSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('line'),
  points: z.array(pointSchema).min(2),
  widthMm: z.number().positive().default(2),
  heightMm: z.number().positive().default(RELIEF_MM.wallLine),
  style: z.enum(['dashed', 'solid']).default('solid'),
  sourceId: z.string().nullable().default(null),
})

// A textured raised area (e.g. restroom zone), as a polygon.
export const tactileAreaSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('area'),
  polygon: z.array(pointSchema).min(3),
  texture: z.enum(['dots', 'lines', 'solid']).default('dots'),
  heightMm: z.number().positive().default(RELIEF_MM.areaTexture),
  sourceId: z.string().nullable().default(null),
})

// A standardized point symbol (door threshold, stairs, elevator, ...).
export const tactileSymbolSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('symbol'),
  symbol: z.enum(['door', 'north', ...featureKinds]),
  at: pointSchema,
  rotation: z.number().default(0),
  sizeMm: z.number().positive().default(6),
  heightMm: z.number().positive().default(RELIEF_MM.pointSymbol),
  sourceId: z.string().nullable().default(null),
})

// A braille run on the map: usually a 1-2 letter key resolved via the
// legend; the plate title is a longer run.
export const brailleLabelSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('braille'),
  // Uncontracted (Grade 1) UEB text, e.g. "st" or a title line.
  key: z.string().min(1).max(48),
  at: pointSchema,
  sourceId: z.string().nullable().default(null),
})

export const legendEntrySchema = z.object({
  key: z.string().min(1).max(3),
  text: z.string().min(1),
})

export const tactileElementSchema = z.discriminatedUnion('kind', [
  tactileLineSchema,
  tactileAreaSchema,
  tactileSymbolSchema,
  brailleLabelSchema,
])

export const tactileDesignSchema = z.object({
  schemaVersion: z.literal(1),
  plate: plateSchema,
  // Large floors print as a grid of plates assembled edge-to-edge
  // (2x2 max in v1). Coordinates span the composite area.
  grid: z
    .object({
      rows: z.number().int().min(1).max(2),
      cols: z.number().int().min(1).max(2),
    })
    .default({ cols: 1, rows: 1 }),
  // Scale actually applied: plate millimeters per plan pixel.
  mmPerPx: z.number().positive(),
  title: z.string().nullable().default(null),
  elements: z.array(tactileElementSchema),
  legend: z.array(legendEntrySchema),
  // True when the legend overflows onto a second plate.
  separateLegendPlate: z.boolean().default(false),
})

export const validationViolationSchema = z.object({
  rule: z.string().min(1),
  message: z.string().min(1),
  elementIds: z.array(z.string()),
  measuredMm: z.number().nullable().default(null),
  requiredMm: z.number().nullable().default(null),
})

export type Plate = z.infer<typeof plateSchema>
export type PlateGrid = { cols: number; rows: number }

// Overall assembled dimensions of a (possibly multi-plate) design.
export function compositeSize(design: {
  grid?: PlateGrid
  plate: { heightMm: number; widthMm: number }
}): { heightMm: number; widthMm: number } {
  const grid = design.grid ?? { cols: 1, rows: 1 }
  return {
    heightMm: design.plate.heightMm * grid.rows,
    widthMm: design.plate.widthMm * grid.cols,
  }
}
export type TactileLine = z.infer<typeof tactileLineSchema>
export type TactileArea = z.infer<typeof tactileAreaSchema>
export type TactileSymbol = z.infer<typeof tactileSymbolSchema>
export type BrailleLabel = z.infer<typeof brailleLabelSchema>
export type LegendEntry = z.infer<typeof legendEntrySchema>
export type TactileElement = z.infer<typeof tactileElementSchema>
export type TactileDesign = z.infer<typeof tactileDesignSchema>
export type ValidationViolation = z.infer<typeof validationViolationSchema>
