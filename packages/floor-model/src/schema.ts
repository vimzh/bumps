import { z } from 'zod'

// All coordinates are in plan pixel space (the normalized plan image),
// origin top-left, y down. Physical scale arrives via plan.pixelsPerMeter.

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
})

const confidenceSchema = z.number().min(0).max(1)

export const wallSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('wall'),
  a: pointSchema,
  b: pointSchema,
  thickness: z.number().positive().default(8),
  confidence: confidenceSchema,
})

export const openingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['door', 'window']),
  // Center of the opening; width along the wall it sits on.
  at: pointSchema,
  width: z.number().positive(),
  wallId: z.string().nullable().default(null),
  confidence: confidenceSchema,
})

export const roomSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('room'),
  polygon: z.array(pointSchema).min(3),
  label: z.string().nullable().default(null),
  confidence: confidenceSchema,
})

export const featureKinds = [
  'stairs',
  'elevator',
  'entrance',
  'exit',
  'restroom',
  'ramp',
  'you-are-here',
  // Permanent-fixture landmarks (user-added only; the parser never emits them).
  'reception',
  'seating',
  'info-point',
] as const

export const featureSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(featureKinds),
  at: pointSchema,
  // Degrees clockwise; for stairs/ramps this is the ascending direction.
  rotation: z.number().default(0),
  confidence: confidenceSchema,
})

// Furniture is represented as labeled blocks (clubbed: a row of chairs is
// one block labeled "chairs"). On the plate they become low-relief areas
// with a braille key — height-differentiated from walls, per the research
// on reduced spacing between height-differentiated tactile elements.
export const furnitureSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('furniture'),
  polygon: z.array(pointSchema).min(3),
  label: z.string().min(1),
  confidence: confidenceSchema,
})

// Guide paths / walkways: raised broken lines on the plate (BANA guide-
// path convention). Campus walkways, corridors' guidance lines, routes.
export const pathSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('path'),
  points: z.array(pointSchema).min(2),
  confidence: confidenceSchema,
})

export const floorModelSchema = z.object({
  schemaVersion: z.literal(1),
  // Map title, embossed on the plate edge and used in the legend.
  title: z.string().nullable().default(null),
  plan: z.object({
    widthPx: z.number().positive(),
    heightPx: z.number().positive(),
    pixelsPerMeter: z.number().positive().nullable().default(null),
    // Degrees clockwise from "up" to true north, if known.
    north: z.number().nullable().default(null),
  }),
  walls: z.array(wallSchema),
  openings: z.array(openingSchema),
  rooms: z.array(roomSchema),
  features: z.array(featureSchema),
  furniture: z.array(furnitureSchema).default([]),
  paths: z.array(pathSchema).default([]),
})

export type Point = z.infer<typeof pointSchema>
export type Wall = z.infer<typeof wallSchema>
export type Opening = z.infer<typeof openingSchema>
export type Room = z.infer<typeof roomSchema>
export type Feature = z.infer<typeof featureSchema>
export type Furniture = z.infer<typeof furnitureSchema>
export type Path = z.infer<typeof pathSchema>
export type FloorModel = z.infer<typeof floorModelSchema>

export type FloorElement = Feature | Furniture | Opening | Path | Room | Wall

export function allElements(model: FloorModel): FloorElement[] {
  return [
    ...model.walls,
    ...model.openings,
    ...model.rooms,
    ...model.features,
    // Models stored before these fields existed may lack them.
    ...(model.furniture ?? []),
    ...(model.paths ?? []),
  ]
}

export function findElement(
  model: FloorModel,
  id: string,
): FloorElement | undefined {
  return allElements(model).find((element) => element.id === id)
}
