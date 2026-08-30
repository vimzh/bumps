import { z } from 'zod'

// All coordinates are in plan pixel space (the normalized plan image),
// origin top-left, y down. Physical scale arrives via plan.pixelsPerMeter.

const MAX_ELEMENTS = 2_000
const MAX_POINTS = 2_000
const idSchema = z.string().min(1).max(80)
const labelSchema = z.string().max(200)
const requiredLabelSchema = labelSchema.min(1)

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
}).strict()

const confidenceSchema = z.number().min(0).max(1)

export const wallSchema = z.object({
  id: idSchema,
  kind: z.literal('wall'),
  a: pointSchema,
  b: pointSchema,
  thickness: z.number().positive().default(8),
  confidence: confidenceSchema,
}).strict().refine((wall) => wall.a.x !== wall.b.x || wall.a.y !== wall.b.y, {
  message: 'Wall endpoints must be distinct',
  path: ['b'],
})

export const openingSchema = z.object({
  id: idSchema,
  kind: z.enum(['door', 'window']),
  // Center of the opening; width along the wall it sits on.
  at: pointSchema,
  width: z.number().positive(),
  wallId: idSchema.nullable().default(null),
  confidence: confidenceSchema,
}).strict()

export const roomSchema = z.object({
  id: idSchema,
  kind: z.literal('room'),
  polygon: z.array(pointSchema).min(3).max(MAX_POINTS),
  label: labelSchema.nullable().default(null),
  confidence: confidenceSchema,
}).strict()

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
  id: idSchema,
  kind: z.enum(featureKinds),
  at: pointSchema,
  // Degrees clockwise; for stairs/ramps this is the ascending direction.
  rotation: z.number().default(0),
  confidence: confidenceSchema,
}).strict()

// Furniture is represented as labeled blocks (clubbed: a row of chairs is
// one block labeled "chairs"). On the plate they become low-relief areas
// with a braille key — height-differentiated from walls, per the research
// on reduced spacing between height-differentiated tactile elements.
export const furnitureSchema = z.object({
  id: idSchema,
  kind: z.literal('furniture'),
  polygon: z.array(pointSchema).min(3).max(MAX_POINTS),
  label: requiredLabelSchema,
  confidence: confidenceSchema,
}).strict()

// Guide paths / walkways: raised broken lines on the plate (BANA guide-
// path convention). Campus walkways, corridors' guidance lines, routes.
export const pathSchema = z.object({
  id: idSchema,
  kind: z.literal('path'),
  points: z.array(pointSchema).min(2).max(MAX_POINTS),
  confidence: confidenceSchema,
}).strict()

// Streets / drives on site and campus plans: drawn bands with a real
// width, rendered as smooth low-relief strips (PSU-model convention).
export const roadSchema = z.object({
  id: idSchema,
  kind: z.literal('road'),
  points: z.array(pointSchema).min(2).max(MAX_POINTS),
  // Drawn band width in plan pixels.
  widthPx: z.number().positive(),
  label: labelSchema.nullable().default(null),
  confidence: confidenceSchema,
}).strict()

export const floorModelSchema = z.object({
  schemaVersion: z.literal(1),
  // Map title, embossed on the plate edge and used in the legend.
  title: labelSchema.nullable().default(null),
  plan: z.object({
    widthPx: z.number().positive(),
    heightPx: z.number().positive(),
    pixelsPerMeter: z.number().positive().nullable().default(null),
    // Degrees clockwise from "up" to true north, if known.
    north: z.number().nullable().default(null),
  }).strict(),
  walls: z.array(wallSchema).max(MAX_ELEMENTS),
  openings: z.array(openingSchema).max(MAX_ELEMENTS),
  rooms: z.array(roomSchema).max(MAX_ELEMENTS),
  features: z.array(featureSchema).max(MAX_ELEMENTS),
  furniture: z.array(furnitureSchema).max(MAX_ELEMENTS).default([]),
  paths: z.array(pathSchema).max(MAX_ELEMENTS).default([]),
  roads: z.array(roadSchema).max(MAX_ELEMENTS).default([]),
}).strict().superRefine((model, context) => {
  const elements = [
    ...model.walls,
    ...model.openings,
    ...model.rooms,
    ...model.features,
    ...model.furniture,
    ...model.paths,
    ...model.roads,
  ]
  if (new Set(elements.map((element) => element.id)).size !== elements.length) {
    context.addIssue({ code: 'custom', message: 'Element ids must be unique' })
  }

  const wallIds = new Set(model.walls.map((wall) => wall.id))
  model.openings.forEach((opening, index) => {
    if (opening.wallId !== null && !wallIds.has(opening.wallId)) {
      context.addIssue({
        code: 'custom',
        message: `Unknown wall id: ${opening.wallId}`,
        path: ['openings', index, 'wallId'],
      })
    }
  })
})

export type Point = z.infer<typeof pointSchema>
export type Wall = z.infer<typeof wallSchema>
export type Opening = z.infer<typeof openingSchema>
export type Room = z.infer<typeof roomSchema>
export type Feature = z.infer<typeof featureSchema>
export type Furniture = z.infer<typeof furnitureSchema>
export type Path = z.infer<typeof pathSchema>
export type Road = z.infer<typeof roadSchema>
export type FloorModel = z.infer<typeof floorModelSchema>

export type FloorElement =
  | Feature
  | Furniture
  | Opening
  | Path
  | Road
  | Room
  | Wall

export function allElements(model: FloorModel): FloorElement[] {
  return [
    ...model.walls,
    ...model.openings,
    ...model.rooms,
    ...model.features,
    // Models stored before these fields existed may lack them.
    ...(model.furniture ?? []),
    ...(model.paths ?? []),
    ...(model.roads ?? []),
  ]
}

export function findElement(
  model: FloorModel,
  id: string,
): FloorElement | undefined {
  return allElements(model).find((element) => element.id === id)
}
