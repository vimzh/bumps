import path from 'node:path'
import { z } from 'zod'
import { LlmAgent, InMemorySessionService, Runner } from '@google/adk'
import { featureKinds, floorModelSchema, type FloorModel } from '@bumps/floor-model'
import { JSON_ONLY, llmPointSchema, makeModel, MODEL_CRITICAL, parseAgentJson } from './llm'
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
  title: z.string().nullable().optional(),
  walls: z.array(
    z.object({
      id: z.string(),
      // Dialects: a/b points, or the whole segment as a=[x0,y0,x1,y1].
      a: z.union([llmPoint, z.tuple([z.number(), z.number(), z.number(), z.number()])]),
      b: llmPoint.optional(),
      thickness: z.number().optional(),
      confidence: llmConfidence,
    }),
  ),
  openings: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['door', 'window']),
      at: llmPoint,
      width: z.number().min(1),
      wallId: z.string().nullable().optional(),
      confidence: llmConfidence,
    }),
  ),
  rooms: z.array(
    z.object({
      id: z.string(),
      polygon: z.array(llmPoint).min(3),
      label: z.string().nullable().optional(),
      confidence: llmConfidence,
    }),
  ),
  features: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(featureKinds),
      at: llmPoint,
      rotation: z.number().optional(),
      confidence: llmConfidence,
    }),
  ),
  furniture: z.array(
    z.object({
      id: z.string(),
      polygon: z.array(llmPoint).min(3).optional(),
      // The model's preferred block shape: [x0, y0, x1, y1].
      bounds: z.array(z.number()).length(4).optional(),
      label: z.string(),
      confidence: llmConfidence,
    }),
  ),
  paths: z
    .array(
      z.object({
        id: z.string(),
        points: z.array(llmPoint).min(2),
        confidence: llmConfidence,
      }),
    )
    .optional(),
  north: z.number().nullable().optional(),
})

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

const INSTRUCTION = `You read architectural floor plans for blind-accessibility mapping.

You are given one floor plan image. Extract its structure as JSON:

- walls: load-bearing and partition walls as straight segments (a, b endpoints). Split bent walls into segments. thickness is the drawn wall thickness in pixels. Include SHORT wall stubs and partial partitions too — even segments barely a door-width long matter for navigation; do not merge them away.
- openings: doors and windows. "at" is the center of the opening, width its size along the wall in pixels. Set wallId to the id of the wall it interrupts, or null. EVERY quarter-circle swing arc is a door — count the arcs. Almost every enclosed room has at least one door; if a room looks sealed, look again for its doorway before moving on.
- rooms: enclosed spaces as simple polygons (3+ corner points, no self-intersection). TRACE THE ACTUAL OUTLINE: an L- or T-shaped room/building gets its true 6-8 corner polygon — never collapse a drawn footprint to a triangle or a loose blob. label is the room's printed name if legible, else null. Include corridors as rooms. On campus/site plans each building footprint is a room.
- features: stairs, elevator, entrance, exit, restroom, ramp when their symbols or labels are present. "at" is the symbol center. rotation is degrees clockwise (for stairs/ramp: ascending direction). Never invent a you-are-here feature.
- paths: walkways, guide routes, and pedestrian paths when they are actually DRAWN (campus walkway networks, dotted route lines, marked corridors' guide lines) — as polylines of 2+ points along the path centerline. Never invent paths that are not drawn.
- north: if the plan draws a north arrow or compass, output "north" as degrees clockwise from image-up to north (0 = up); otherwise null.
- furniture: furniture generalized into BLOCKS — coarse axis-aligned rectangles, never per-item outlines. CLUB adjacent same-kind items into one block: a row of chairs is ONE block labeled "chairs", a desk with its chairs is one "desks" block. Blocks must TIGHTLY bound the drawn items (at most ~10% padding) — never inflate a block beyond what is drawn; prefer two tight blocks over one oversized one. Do not miss chair clusters ("chairs"). label: short generic lowercase noun ("sofa", "chairs", "desks", "table", "counter"), plural when clubbed. Only include furniture actually drawn; skip tiny isolated items.

Rules:
- Coordinates are PIXELS in the exact image you were given, origin top-left, x right, y down. The prompt states the image dimensions; never exceed them.
- ids: short, unique, prefixed by type: w-1, d-1, win-1, r-1, f-1, fur-1, ...
- confidence: your honest certainty in THIS element (0-1). Blurry, ambiguous, inferred, or partially occluded elements get lower values. Do not default everything to one value.
- Ignore dimension lines, hatching, title blocks, and decorative detail (the compass/north arrow feeds ONLY the "north" field).
- Emit nothing outside the plan's drawn area.

Output shape (coordinates are [x, y] number pairs):
{"title": "..." , "walls": [{"id": "w-1", "a": [x, y], "b": [x, y], "thickness": 12, "confidence": 0.9}], "openings": [{"id": "d-1", "kind": "door", "at": [x, y], "width": 40, "wallId": "w-1", "confidence": 0.9}], "rooms": [{"id": "r-1", "polygon": [[x, y], [x, y], [x, y], [x, y]], "label": "RECEPTION", "confidence": 0.9}], "features": [{"id": "f-1", "kind": "stairs", "at": [x, y], "rotation": 0, "confidence": 0.9}], "furniture": [{"id": "fur-1", "label": "chairs", "bounds": [x0, y0, x1, y1], "confidence": 0.9}], "paths": [{"id": "p-1", "points": [[x, y], [x, y]], "confidence": 0.8}], "north": null}` + JSON_ONLY

export const parserAgent = new LlmAgent({
  name: 'floor_plan_parser',
  description: 'Extracts a structured floor model from a floor plan image',
  model: makeModel(MODEL_CRITICAL),
  instruction: INSTRUCTION,
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

type MessagePart =
  | { inlineData: { data: string; mimeType: string } }
  | { text: string }

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
  const runner = new Runner({
    appName: 'bumps',
    agent: parserAgent,
    sessionService: new InMemorySessionService(),
  })

  let finalText = ''
  for await (const event of runner.runEphemeral({
    userId: 'bumps',
    newMessage: { parts },
  })) {
    if (event.errorMessage) {
      throw new Error(`Parser model error: ${event.errorMessage}`)
    }
    const text = event.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
    if (text) {
      finalText = text
    }
  }

  if (!finalText) {
    throw new Error('Parser returned no output')
  }
  const parsed = parseAgentJson(parsedOutputSchema, finalText, 'Parser')
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
  })
}

export async function parsePlanImage(
  planPath: string,
  dimensions: { widthPx: number; heightPx: number },
): Promise<FloorModel> {
  const image = await loadPlanImagePart(planPath)
  return runParser(
    [
      {
        text: `Parse this floor plan. The image is ${dimensions.widthPx}x${dimensions.heightPx} pixels.`,
      },
      { inlineData: image },
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
  const image = await loadPlanImagePart(planPath)
  return runParser(
    [
      {
        text: `Parse this floor plan. The image is ${dimensions.widthPx}x${dimensions.heightPx} pixels.`,
      },
      { inlineData: image },
      {
        text: `Your previous extraction:\n${JSON.stringify(previousModel)}\n\nA reviewer compared it against the plan and found:\n${critiqueJson}\n\nProduce a corrected COMPLETE model: fix every finding, keep unaffected elements and their ids unchanged, and re-assess confidence honestly.`,
      },
    ],
    dimensions,
    previousModel.title,
  )
}
