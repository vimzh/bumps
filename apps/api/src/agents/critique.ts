import { z } from 'zod'
import { LlmAgent, InMemorySessionService, Runner } from '@google/adk'
import { JSON_ONLY, makeModel, MODEL_CRITICAL, parseAgentJson } from './llm'
import { withModelRetry } from './retry'

// Kept to Gemini's response-schema subset (no string length constraints).
export const critiqueSchema = z.object({
  verdict: z.enum(['pass', 'needs_refinement']),
  findings: z.array(
    z.object({
      kind: z.enum(['missing', 'extra', 'misplaced', 'mislabeled']),
      // Id of the affected element in the current model, when it exists.
      elementId: z.string().nullable(),
      description: z.string(),
      severity: z.enum(['minor', 'major']),
    }),
  ),
  // Per-element confidence overrides based on what the review saw.
  confidenceAdjustments: z.array(
    z.object({
      elementId: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
})

export type Critique = z.infer<typeof critiqueSchema>

const INSTRUCTION = `You review machine extractions of architectural floor plans.

You receive two images:
- IMAGE 1: the original floor plan.
- IMAGE 2: a rendering of the extracted model. Legend: light gray filled polygons = rooms (label text at center), darker gray blocks with labels = furniture blocks, black lines = walls, colored circles = doors/windows, small squares with letters = features (S stairs, E elevator, WC restroom, arrow entrance, X exit, R ramp).

You also receive the extracted model as JSON (ids included).

Report structural discrepancies between the images:
- missing: present in the plan, absent from the model
- extra: in the model but not in the plan
- misplaced: exists but noticeably wrong position, size, or shape
- mislabeled: wrong or missing room label that is legible in the plan

Rules:
- Only report real structural issues. Ignore rendering style, colors, line weights, dimensions, and hatching.
- Furniture is expected as coarse clubbed blocks (a row of chairs = one "chairs" block), not per-item outlines. Report furniture when a substantial piece is missing entirely (chair clusters count), a block is badly oversized versus what is drawn, badly misplaced, or invented — always severity "minor".
- Check EVERY enclosed room has at least one doorway (a door in the model). A sealed room almost always means a missed door arc — report it as missing, severity "major".
- Check for missed SHORT wall stubs and partial partitions; a missing stub wall is severity "major" when it changes how a person would navigate.
- severity "major" = would mislead a blind reader navigating (missing room, wall, door, or feature; badly wrong geometry). "minor" = cosmetic or small offsets.
- Use element ids from the JSON for extra/misplaced/mislabeled findings; elementId null for missing ones.
- confidenceAdjustments: for elements you verified match the plan well, raise confidence; for dubious ones, lower it. Only include elements you actually assessed.
- verdict "pass" when the model faithfully captures the plan's structure with no major findings.` + JSON_ONLY

export const critiqueAgent = new LlmAgent({
  name: 'floor_plan_critic',
  description: 'Compares a floor plan against a rendering of its extracted model',
  model: makeModel(MODEL_CRITICAL),
  instruction: INSTRUCTION,
  outputSchema: critiqueSchema,
  generateContentConfig: {
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: -1 },
  },
})

export async function runCritique(params: {
  planPngBase64: string
  planMime: string
  renderPngBase64: string
  modelJson: string
}): Promise<Critique> {
  return withModelRetry(() => runCritiqueOnce(params))
}

async function runCritiqueOnce(params: {
  planPngBase64: string
  planMime: string
  renderPngBase64: string
  modelJson: string
}): Promise<Critique> {
  const runner = new Runner({
    appName: 'bumps',
    agent: critiqueAgent,
    sessionService: new InMemorySessionService(),
  })

  let finalText = ''
  for await (const event of runner.runEphemeral({
    userId: 'bumps',
    newMessage: {
      parts: [
        { text: 'IMAGE 1 — the original floor plan:' },
        { inlineData: { data: params.planPngBase64, mimeType: params.planMime } },
        { text: 'IMAGE 2 — rendering of the extracted model:' },
        { inlineData: { data: params.renderPngBase64, mimeType: 'image/png' } },
        { text: `Extracted model JSON:\n${params.modelJson}` },
      ],
    },
  })) {
    if (event.errorMessage) {
      throw new Error(`Critique model error: ${event.errorMessage}`)
    }
    const text = event.content?.parts?.map((part) => part.text ?? '').join('')
    if (text) {
      finalText = text
    }
  }

  if (!finalText) {
    throw new Error('Critique returned no output')
  }
  return parseAgentJson(critiqueSchema, finalText, 'Critique')
}
