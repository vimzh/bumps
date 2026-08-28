import path from 'node:path'
import { z } from 'zod'
import { LlmAgent, InMemorySessionService, Runner } from '@google/adk'
import { featureKinds, floorModelSchema, type FloorModel } from '@bumps/floor-model'
import { withModelRetry } from './retry'

export const MODEL_CRITICAL = process.env.MODEL_CRITICAL ?? 'gemini-3.5-flash'
export const MODEL_FAST = process.env.MODEL_FAST ?? 'gemini-3.5-flash'

// What the model emits: the floor model minus fields we own (schemaVersion)
// and minus plan dimensions (we know them from the image we sent).
// NOTE: keep this schema to Gemini's response-schema subset — no .positive()
// (exclusiveMinimum), no .default(), no string length constraints. The strict
// package schema re-validates the result afterwards.
const llmPoint = z.object({ x: z.number(), y: z.number() })
const llmConfidence = z.number().min(0).max(1)

const parsedOutputSchema = z.object({
  title: z.string().nullable(),
  walls: z.array(
    z.object({
      id: z.string(),
      kind: z.literal('wall'),
      a: llmPoint,
      b: llmPoint,
      thickness: z.number().min(1),
      confidence: llmConfidence,
    }),
  ),
  openings: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['door', 'window']),
      at: llmPoint,
      width: z.number().min(1),
      wallId: z.string().nullable(),
      confidence: llmConfidence,
    }),
  ),
  rooms: z.array(
    z.object({
      id: z.string(),
      kind: z.literal('room'),
      polygon: z.array(llmPoint).min(3),
      label: z.string().nullable(),
      confidence: llmConfidence,
    }),
  ),
  features: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(featureKinds),
      at: llmPoint,
      rotation: z.number(),
      confidence: llmConfidence,
    }),
  ),
})

const INSTRUCTION = `You read architectural floor plans for blind-accessibility mapping.

You are given one floor plan image. Extract its structure as JSON:

- walls: load-bearing and partition walls as straight segments (a, b endpoints). Split bent walls into segments. thickness is the drawn wall thickness in pixels.
- openings: doors and windows. "at" is the center of the opening, width its size along the wall in pixels. Set wallId to the id of the wall it interrupts, or null.
- rooms: enclosed spaces as simple polygons (3+ corner points, no self-intersection). label is the room's printed name if legible, else null. Include corridors as rooms.
- features: stairs, elevator, entrance, exit, restroom, ramp when their symbols or labels are present. "at" is the symbol center. rotation is degrees clockwise (for stairs/ramp: ascending direction). Never invent a you-are-here feature.

Rules:
- Coordinates are PIXELS in the exact image you were given, origin top-left, x right, y down. The prompt states the image dimensions; never exceed them.
- ids: short, unique, prefixed by type: w-1, d-1, win-1, r-1, f-1, ...
- confidence: your honest certainty in THIS element (0-1). Blurry, ambiguous, inferred, or partially occluded elements get lower values. Do not default everything to one value.
- Ignore furniture, dimension lines, hatching, and decorative detail.
- Emit nothing outside the plan's drawn area.`

export const parserAgent = new LlmAgent({
  name: 'floor_plan_parser',
  description: 'Extracts a structured floor model from a floor plan image',
  model: MODEL_CRITICAL,
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
  const parsed = parsedOutputSchema.parse(JSON.parse(finalText))
  return floorModelSchema.parse({
    schemaVersion: 1,
    title: parsed.title ?? title ?? null,
    plan: {
      widthPx: dimensions.widthPx,
      heightPx: dimensions.heightPx,
      pixelsPerMeter: null,
      north: null,
    },
    walls: parsed.walls,
    openings: parsed.openings,
    rooms: parsed.rooms,
    features: parsed.features,
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
