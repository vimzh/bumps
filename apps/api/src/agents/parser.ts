import path from 'node:path'
import { z } from 'zod'
import { LlmAgent } from '@google/adk'
import { imageSize } from 'image-size'
import { featureKinds, floorModelSchema, type FloorModel } from '@bumps/floor-model'
import { cropPlanImage, type NormalizedCrop } from '../lib/rasterize'
import {
  JSON_ONLY,
  llmPointSchema,
  makeModel,
  MODEL_CRITICAL,
  parseAgentJson,
  runAgentTurn,
  type MessagePart,
} from './llm'
import { withModelRetry } from './retry'

export { MODEL_CRITICAL, MODEL_FAST } from './llm'

// What the model emits: the floor model minus fields we own (schemaVersion)
// and minus plan dimensions (we know them from the image we sent).
// NOTE: keep this schema to Gemini's response-schema subset — no .positive()
// (exclusiveMinimum), no .default(), no string length constraints. The strict
// package schema re-validates the result afterwards.
const llmPoint = llmPointSchema
const llmConfidence = z.number().min(0).max(1)

// Lenient on purpose: the Interactions path has no server-side schema
// enforcement, so redundant fields (array-implied kinds) and secondary
// fields are optional here; code fills them and the strict package schema
// validates the final result.
const parsedOutputSchema = z.object({
  drawingType: z.enum(['floor-plan', 'site-plan', 'not-a-plan']),
  suitability: z.enum(['good', 'usable', 'poor']),
  suitabilityIssues: z.array(z.string()),
  title: z.string().nullable().optional(),
  walls: z.array(
    z.object({
      id: z.string(),
      kind: z.literal('wall').optional(),
      // Dialects: a/b points, or the whole segment as a=[x0,y0,x1,y1].
      a: z.union([llmPoint, z.tuple([z.number(), z.number(), z.number(), z.number()])]),
      b: llmPoint.optional(),
      thickness: z.number().optional(),
      confidence: llmConfidence,
    }).strict(),
  ),
  openings: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['door', 'window']),
      at: llmPoint,
      width: z.number().min(1),
      wallId: z.string().nullable().optional(),
      confidence: llmConfidence,
    }).strict(),
  ),
  rooms: z.array(
    z.object({
      id: z.string(),
      kind: z.literal('room').optional(),
      polygon: z.array(llmPoint).min(3),
      label: z.string().nullable().optional(),
      confidence: llmConfidence,
    }).strict(),
  ),
  features: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(featureKinds),
      at: llmPoint,
      rotation: z.number().optional(),
      confidence: llmConfidence,
    }).strict(),
  ),
  furniture: z.array(
    z.object({
      id: z.string(),
      kind: z.literal('furniture').optional(),
      polygon: z.array(llmPoint).min(3).optional(),
      // The model's preferred block shape: [x0, y0, x1, y1].
      bounds: z.array(z.number()).length(4).optional(),
      label: z.string(),
      confidence: llmConfidence,
    }).strict(),
  ),
  paths: z
    .array(
      z.object({
        id: z.string(),
        kind: z.literal('path').optional(),
        points: z.array(llmPoint).min(2),
        confidence: llmConfidence,
      }).strict(),
    )
    .optional(),
  roads: z
    .array(
      z.object({
        id: z.string(),
        kind: z.literal('road').optional(),
        points: z.array(llmPoint).min(2),
        widthPx: z.coerce.number().min(1).optional(),
        width: z.coerce.number().min(1).optional(),
        label: z.string().nullable().optional(),
        confidence: llmConfidence,
      }).strict(),
    )
    .optional(),
  north: z.number().nullable().optional(),
}).strict()

function furniturePolygon(item: {
  bounds?: number[]
  polygon?: { x: number; y: number }[]
}): { x: number; y: number }[] {
  if (item.polygon && item.polygon.length >= 3) return item.polygon
  if (item.bounds) {
    const [x0, y0, x1, y1] = item.bounds as [number, number, number, number]
    return [
      { x: Math.min(x0, x1), y: Math.min(y0, y1) },
      { x: Math.max(x0, x1), y: Math.min(y0, y1) },
      { x: Math.max(x0, x1), y: Math.max(y0, y1) },
      { x: Math.min(x0, x1), y: Math.max(y0, y1) },
    ]
  }
  throw new Error('Parser returned schema-invalid output: furniture without geometry')
}

export const PARSER_INSTRUCTION = `You are an expert architectural-drawing analyst extracting structured geometry from ONE floor plan (or campus/site plan) image, to be turned into a tactile map for blind readers. Everything you emit becomes raised geometry under a blind reader's fingertip, and everything you miss is simply absent from their world — extract with care.

You receive one full-plan image. All coordinates must use that image's pixel coordinate system.

## First, classify the drawing
- floor-plan: a clear orthographic 2D building plan with traceable room boundaries, walls, and openings.
- site-plan: a clear orthographic 2D site/campus map with traceable building footprints and connecting roads or walkways.
- not-a-plan: perspective/isometric marketing render, ordinary photograph, elevation, transit diagram, illustration, or any image whose geometry cannot be traced as an overhead plan. An isometric architectural view is still not a floor plan.

Set suitability to good when geometry and labels are clear, usable when the overhead geometry remains traceable despite low resolution or moderate clutter, and poor when perspective, occlusion, illegibility, or missing boundaries make faithful extraction impossible. List concrete suitabilityIssues. For not-a-plan or poor input, return empty geometry arrays; the application will reject it and ask for a real floor/site plan.

For a BUILDING FLOOR PLAN: extract walls/openings/rooms/features/furniture. Roads/paths only if grounds are also drawn.
For a CAMPUS or SITE PLAN: each building footprint is a "room" with its name as label; extract roads, walkway paths, and entrances. Walls only where an individual building's interior is actually drawn.

## What to extract

walls — load-bearing and partition walls as straight segments (a, b endpoints).
- Split bent walls into straight segments at each corner.
- L-, U-, and T-shaped walls are connected segment networks, not decoration. Trace every leg, including a short leg. At an L/U corner the segment endpoints must meet; at a T junction the stem endpoint must land on the crossbar segment.
- CURVED WALLS ARE REQUIRED: approximate every visible curve with a connected chain of 6-16 short wall segments whose endpoints touch and visibly follow the arc. Never omit a curve or replace it with one straight chord.
- thickness = drawn wall thickness in pixels.
- Include SHORT stubs and partial partitions — even segments barely a door-width long shape navigation; never merge them away.
- Follow the drawn geometry precisely: endpoints ON the wall centerlines, not approximations.

openings — doors and windows in walls.
- kind MUST be exactly "door" or "window". Encode an archway or open passage through a wall as "door" because it becomes the same tactile wall gap.
- "at" = center of the opening; width = its size along the wall in pixels; wallId = id of the interrupted wall (or null).
- A door requires DIRECT VISIBLE EVIDENCE: a door leaf plus swing arc rooted at a wall gap, parallel sliding-door panels at a wall gap, or an unmistakable open passage interrupting a wall. A quarter-circle curve by itself, curved furniture, dimension marks, or nearby text is not a door.
- A plain open passage is directly evidenced when two aligned wall strokes visibly terminate on opposite sides of a plausible doorway-width gap between navigable spaces. Trace these gaps even when the drawing omits a swing arc. Do not treat an arbitrary missing boundary or large unbounded area as a passage.
- Never infer or invent a door because a room would otherwise be sealed. If no doorway is visibly traceable, emit no opening there and lower the room confidence.
- Assign wallId whenever the interrupted wall is identifiable. If you cannot locate the opening on a specific visible wall, omit it rather than guessing.

rooms — enclosed spaces (or building footprints on campus plans) as simple polygons.
- TRACE THE TRUE OUTLINE: an L- or T-shaped space gets its actual 6-8 corner polygon. NEVER collapse a drawn footprint to a triangle, and never emit a thin sliver when the drawing shows a full building.
- For a curved room boundary, put 6-16 ordered vertices along the curve so the polygon follows it; never flatten the curve to a single edge.
- label = the printed name if legible (else null). Corridors are rooms too.
- Polygons must not self-intersect; vertices in drawing order.

features — stairs, elevator, entrance, exit, restroom, ramp — when their symbol or label is present.
- "at" = symbol center; rotation = degrees clockwise (stairs/ramp: ascending direction; entrance: direction of entry).
- Extract EVERY occurrence, not one representative.
- Never invent a you-are-here feature.
- Keep only features that help a blind visitor orient, navigate, find accessibility facilities, or avoid hazards. Ignore operational and technology markers such as Wi-Fi hotspots, fire equipment, CCTV, vending machines, and electrical fixtures.
- "info-point" means a staffed visitor information or reception point. A Wi-Fi hotspot is never an info-point.

furniture — furniture and fixed interior landmarks generalized into tactile areas, never per-item outlines.
- CLUB adjacent same-kind items: a row of chairs is ONE block "chairs"; a desk group is one "desks" block.
- Blocks TIGHTLY bound the drawn items (at most 10% padding); prefer two tight blocks over one inflated one.
- PRESERVE SHAPE for navigation landmarks. A round fountain, circular desk, round planter, or curved counter must use a 12-24 point polygon following its visible outline — never a square or rectangular bounds box. Rectangular furniture may use bounds.
- label: short generic lowercase noun ("fountain", "sofa", "chairs", "desks", "table", "counter"), plural when clubbed.
- Skip tiny isolated items; do not miss chair clusters.

paths — pedestrian walkways, guide routes, marked trails — ONLY when actually drawn.
- Polyline of 2+ points along the centerline. Campus walkway networks matter: they connect the buildings; without them the map is disconnected blocks. Trace the main network, splitting at junctions into separate paths.
- Never invent paths that are not drawn.

roads — streets, drives, parking access — drawn as bands with real width.
- Polyline along the centerline + widthPx = the drawn band width in pixels.
- label = the street name if printed ("Main St").
- On campus/site plans the street network is required content when drawn — it is how a blind reader anchors the campus to the city.

north — if a north arrow / compass is drawn: degrees clockwise from image-up to north (0 = up, 90 = north points right). Else null.

title — the plan's printed title if present.

## Coordinate discipline
- Coordinates are PIXELS in the exact image given, origin top-left, x right, y down. The prompt states the image dimensions; never exceed them.
- Trace what is drawn where it is drawn. Do not snap, straighten, or "improve" the drawing.
- Ignore dimension lines, hatching, title blocks, and decorative texture (the compass feeds ONLY "north"; a scale bar feeds nothing).
- Emit nothing outside the plan's drawn area.

## Honesty
- ids: short, unique, type-prefixed: w-1, d-1, win-1, r-1, f-1, fur-1, p-1, rd-1.
- confidence per element: your honest certainty 0-1. Blurry, inferred, or occluded means lower. Do not default everything to one value.
- It is better to omit an uncertain opening than to cut a fake gap into a tactile wall. It is better to extract 40 real elements than 8 vague ones. Completeness AND fidelity are both graded by a reviewer comparing your output against the image.

## Output shape (coordinates are [x, y] number pairs)
{"drawingType": "floor-plan", "suitability": "good", "suitabilityIssues": [], "title": "...", "north": null, "walls": [{"id": "w-1", "a": [x, y], "b": [x, y], "thickness": 12, "confidence": 0.9}], "openings": [{"id": "d-1", "kind": "door", "at": [x, y], "width": 40, "wallId": "w-1", "confidence": 0.9}], "rooms": [{"id": "r-1", "polygon": [[x, y], [x, y], [x, y], [x, y]], "label": "RECEPTION", "confidence": 0.9}], "features": [{"id": "f-1", "kind": "stairs", "at": [x, y], "rotation": 0, "confidence": 0.9}], "furniture": [{"id": "fur-1", "label": "chairs", "polygon": [[x, y], [x, y], [x, y], [x, y]], "confidence": 0.9}], "paths": [{"id": "p-1", "points": [[x, y], [x, y]], "confidence": 0.8}], "roads": [{"id": "rd-1", "points": [[x, y], [x, y]], "widthPx": 22, "label": "Main St", "confidence": 0.85}]}` + JSON_ONLY

export const parserAgent = new LlmAgent({
  name: 'floor_plan_parser',
  description: 'Extracts a structured floor model from a floor plan image',
  model: makeModel(MODEL_CRITICAL),
  instruction: PARSER_INSTRUCTION,
  outputSchema: parsedOutputSchema,
  generateContentConfig: {
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: -1 },
  },
})

const MIME_BY_EXT: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export async function loadPlanImagePart(planPath: string) {
  const bytes = await Bun.file(planPath).bytes()
  const mimeType = MIME_BY_EXT[path.extname(planPath).toLowerCase()]
  if (!mimeType) {
    throw new Error(`Unsupported plan image type: ${planPath}`)
  }
  return { data: Buffer.from(bytes).toString('base64'), mimeType }
}

export const DETAIL_CROPS: { crop: NormalizedCrop; label: string }[] = [
  { crop: { height: 0.58, left: 0, top: 0, width: 0.58 }, label: 'top-left' },
  { crop: { height: 0.58, left: 0.42, top: 0, width: 0.58 }, label: 'top-right' },
  { crop: { height: 0.58, left: 0, top: 0.42, width: 0.58 }, label: 'bottom-left' },
  {
    crop: { height: 0.58, left: 0.42, top: 0.42, width: 0.58 },
    label: 'bottom-right',
  },
]

export async function loadPlanImageParts(planPath: string): Promise<MessagePart[]> {
  const bytes = await Bun.file(planPath).bytes()
  const mimeType = MIME_BY_EXT[path.extname(planPath).toLowerCase()]
  if (!mimeType) throw new Error(`Unsupported plan image type: ${planPath}`)
  const { height, width } = imageSize(bytes)
  if (!width || !height) throw new Error(`Could not read plan image: ${planPath}`)
  const parts: MessagePart[] = [
    { text: `FULL PLAN — coordinate space x=0..${width}, y=0..${height}:` },
    { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType } },
  ]
  if (Math.max(width, height) < 1200) return parts
  for (const { crop, label } of DETAIL_CROPS) {
    const x0 = Math.round(crop.left * width)
    const y0 = Math.round(crop.top * height)
    const x1 = Math.round((crop.left + crop.width) * width)
    const y1 = Math.round((crop.top + crop.height) * height)
    const tile = cropPlanImage(bytes, mimeType, crop)
    parts.push(
      {
        text: `DETAIL ${label} — full-plan pixel bounds x=${x0}..${x1}, y=${y0}..${y1}; report coordinates in the FULL PLAN space:`,
      },
      { inlineData: { data: Buffer.from(tile).toString('base64'), mimeType: 'image/png' } },
    )
  }
  return parts
}

async function runParser(
  parts: MessagePart[],
  dimensions: { widthPx: number; heightPx: number },
  title: string | null | undefined,
): Promise<FloorModel> {
  return withModelRetry(() => runParserOnce(parts, dimensions, title))
}

async function runParserOnce(
  parts: MessagePart[],
  dimensions: { widthPx: number; heightPx: number },
  title: string | null | undefined,
): Promise<FloorModel> {
  const finalText = await runAgentTurn({
    adkAgent: parserAgent,
    agentName: 'Parser',
    instruction: PARSER_INSTRUCTION,
    parts,
  })

  const parsed = parseAgentJson(parsedOutputSchema, finalText, 'Parser')
  assertUsablePlanInput(parsed)
  return floorModelSchema.parse({
    schemaVersion: 1,
    title: parsed.title ?? title ?? null,
    plan: {
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      pixelsPerMeter: null,
      north: parsed.north ?? null,
    },
    walls: parsed.walls.map((wall) => {
      const seg = Array.isArray(wall.a)
        ? {
            a: { x: wall.a[0], y: wall.a[1] },
            b: { x: wall.a[2], y: wall.a[3] },
          }
        : wall.b !== undefined
          ? { a: wall.a, b: wall.b }
          : { a: wall.a, b: wall.a }
      return {
        confidence: wall.confidence,
        id: wall.id,
        kind: 'wall' as const,
        thickness: wall.thickness ?? 8,
        ...seg,
      }
    }),
    openings: parsed.openings.map((opening) => ({
      ...opening,
      wallId: opening.wallId ?? null,
    })),
    rooms: parsed.rooms.map((room) => ({
      ...room,
      kind: 'room' as const,
      label: room.label ?? null,
    })),
    features: parsed.features.map((feature) => ({
      ...feature,
      rotation: feature.rotation ?? 0,
    })),
    furniture: parsed.furniture.map((item) => ({
      confidence: item.confidence,
      id: item.id,
      kind: 'furniture' as const,
      label: item.label,
      polygon: furniturePolygon(item),
    })),
    paths: (parsed.paths ?? []).map((path) => ({
      ...path,
      kind: 'path' as const,
    })),
    roads: (parsed.roads ?? []).map((road) => ({
      confidence: road.confidence,
      id: road.id,
      kind: 'road' as const,
      label: road.label ?? null,
      points: road.points,
      widthPx: road.widthPx ?? road.width ?? 12,
    })),
  })
}

export function assertUsablePlanInput(assessment: {
  drawingType: 'floor-plan' | 'site-plan' | 'not-a-plan'
  suitability: 'good' | 'usable' | 'poor'
  suitabilityIssues: string[]
}): void {
  if (assessment.drawingType !== 'not-a-plan' && assessment.suitability !== 'poor') {
    return
  }
  const reason = assessment.suitabilityIssues.join('; ') || assessment.drawingType
  throw new Error(`Input is not a usable floor or site plan: ${reason.slice(0, 400)}`)
}

export async function parsePlanImage(
  planPath: string,
  dimensions: { widthPx: number; heightPx: number },
): Promise<FloorModel> {
  const imagePart = await loadPlanImagePart(planPath)
  return runParser(
    [
      {
        text: `Parse this floor plan. The image is ${dimensions.widthPx}x${dimensions.heightPx} pixels.`,
      },
      { inlineData: imagePart },
    ],
    dimensions,
    null,
  )
}

export async function refineParse(
  planPath: string,
  dimensions: { widthPx: number; heightPx: number },
  previousModel: FloorModel,
  critiqueJson: string,
): Promise<FloorModel> {
  const imagePart = await loadPlanImagePart(planPath)
  return runParser(
    [
      {
        text: `Parse this floor plan. The image is ${dimensions.widthPx}x${dimensions.heightPx} pixels.`,
      },
      { inlineData: imagePart },
      {
        text: `Your previous extraction:\n${JSON.stringify(previousModel)}\n\nA reviewer compared it against the plan and found:\n${critiqueJson}\n\nProduce a corrected COMPLETE model: fix every finding, keep unaffected elements and their ids unchanged, and re-assess confidence honestly. Never add an opening merely to satisfy a sealed-room finding; a new door still requires direct visible evidence in the source image.`,
      },
    ],
    dimensions,
    previousModel.title,
  )
}
