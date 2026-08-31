import { z } from 'zod'
import { LlmAgent } from '@google/adk'
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

// Kept to Gemini's response-schema subset (no string length constraints).
const findingSchema = z.object({
  kind: z.enum(['missing', 'extra', 'misplaced', 'mislabeled']).optional(),
  // Some models emit "type" instead of "kind".
  type: z.enum(['missing', 'extra', 'misplaced', 'mislabeled']).optional(),
  // Id of the affected element in the current model, when it exists.
  elementId: z.string().nullable().optional(),
  // Approximate full-plan pixel location of the problem; lets the refiner
  // receive a zoomed crop of exactly this spot.
  at: llmPointSchema.nullable().optional(),
  description: z.string(),
  severity: z.enum(['minor', 'major']).optional(),
})

// Absolute confidences are used; relative "adjustment" deltas some models
// emit are accepted but discarded (findings drive refinement either way).
const adjustmentsSchema = z
  .array(
    z.object({
      elementId: z.string(),
      confidence: z.number().min(0).max(1).optional(),
      adjustment: z.number().optional(),
    }),
  )
  .optional()

// Plain canonical shape for the agent's outputSchema (ADK needs ZodObject).
export const critiqueOutputSchema = z.object({
  verdict: z.enum(['pass', 'needs_refinement']),
  findings: z.array(findingSchema),
  confidenceAdjustments: adjustmentsSchema,
})

// Canonical shape, plus the grouped dialect some models prefer
// ({missing: [...], extra: [...], ...}); both normalize to Critique.
export const critiqueSchema = z
  .union([
    z.object({
      verdict: z.string(),
      findings: z.array(findingSchema),
      confidenceAdjustments: adjustmentsSchema,
    }),
    z.object({
      verdict: z.string().optional(),
      missing: z.array(findingSchema).optional(),
      extra: z.array(findingSchema).optional(),
      misplaced: z.array(findingSchema).optional(),
      mislabeled: z.array(findingSchema).optional(),
      confidenceAdjustments: adjustmentsSchema,
    }),
  ])
  .transform((raw) => {
    const grouped =
      'findings' in raw && raw.findings
        ? raw.findings
        : (['missing', 'extra', 'misplaced', 'mislabeled'] as const).flatMap(
            (kind) =>
              ((raw as Record<string, unknown>)[kind] as
                | z.infer<typeof findingSchema>[]
                | undefined
                | null ?? []).map((f) => ({ ...f, kind: f.kind ?? kind })),
          )
    const findings = grouped.map((f) => ({
      at: f.at ?? null,
      description: f.description,
      elementId: f.elementId ?? null,
      kind: f.kind ?? f.type ?? 'misplaced',
      severity:
        ['missing', 'extra', 'misplaced'].includes(
          f.kind ?? f.type ?? 'misplaced',
        ) && /\b(?:door|opening|wall|partition|entrance|exit)\b/i.test(f.description)
          ? ('major' as const)
          : (f.severity ?? 'major'),
    }))
    const verdict =
      raw.verdict === 'pass' && findings.length === 0
        ? ('pass' as const)
        : raw.verdict === 'pass'
          ? ('pass' as const)
          : ('needs_refinement' as const)
    return {
      confidenceAdjustments: (raw.confidenceAdjustments ?? []).flatMap((a) =>
        a.confidence === undefined
          ? []
          : [{ confidence: a.confidence, elementId: a.elementId }],
      ),
      findings,
      verdict,
    }
  })

export type Critique = z.infer<typeof critiqueSchema>

export const CRITIQUE_INSTRUCTION = `You review machine extractions of architectural floor plans.

You receive a full original floor plan, optional overlapping zoomed detail views whose annotations map them to full-plan coordinates, an aligned topology overlay, and then a rendering of the extracted model. The render legend is: light gray filled polygons = rooms/buildings (label text at center), darker gray blocks with labels = furniture blocks, black lines = walls, wide translucent gray bands = roads/streets (name above), orange dashed lines = walkway paths, colored circles = doors/windows, small squares with letters = features (S stairs, E elevator, WC restroom, arrow entrance, X exit, R ramp).

The aligned topology overlay places the extracted geometry directly over the source plan: RED lines and endpoint dots are extracted walls, CYAN circles are extracted doors, BLUE circles are extracted windows, GREEN outlines are extracted rooms/building footprints, VIOLET dashed outlines are furniture blocks, MAGENTA squares are features, ORANGE dashed lines are guide paths, and AMBER translucent bands are roads. A visible source wall without red coverage is missing. Red geometry with no source wall beneath it is extra. A cyan door circle without direct door/opening evidence beneath it is a fake door. A drawn room with no green outline (or a green outline that cuts through drawn space) is a missing or misplaced room. Inspect endpoint dots closely: separated endpoints at an L, U, or T junction mean the wall network is disconnected.

You also receive the extracted model as JSON (ids included).

You may also receive a DETERMINISTIC STRUCTURAL AUDIT: attention hints computed by code from the extracted geometry and a pixel-coverage comparison (doorway-width wall gaps, sealed rooms, orphan openings, uncovered-linework regions, normalization notes). These are directives for WHERE to look, not confirmed errors. Verify each hint against the source image: confirmed → report it as a finding with the correct kind and severity; unsupported (the uncovered ink is text, dimensioning, or hatching; the gap is a drawn junction) → dismiss it silently. Never copy an audit line into findings without image evidence.

Report structural discrepancies between the images:
- missing: present in the plan, absent from the model
- extra: in the model but not in the plan
- misplaced: exists but noticeably wrong position, size, or shape
- mislabeled: wrong or missing room label that is legible in the plan

Rules:
- Only report real structural issues. Ignore rendering style, colors, line weights, dimensions, and hatching.
- On campus/site plans: missing drawn streets or the main walkway network are MAJOR findings — they are how the map connects. A building footprint collapsed to a triangle or sliver when the drawing shows a full building is a misplaced MAJOR finding.
- Furniture is expected as coarse clubbed blocks (a row of chairs = one "chairs" block), not per-item outlines, and deliberately filtered for significance: reception/service counters, seating banks, shelving, stages, large tables, landmark fountains/planters, and freestanding columns belong in the model; individual chairs, plants, rugs, small side tables, restroom fixtures, and decor are intentionally skipped and must NOT be reported as missing. Report furniture only when a significant navigation-relevant piece is missing entirely (chair clusters and counters count), a block is badly oversized versus what is drawn, badly misplaced, or invented — always severity "minor".
- Fixed navigation landmarks retain their source outline. A round fountain, circular planter, circular desk, or curved counter rendered as a square/rectangle is a misplaced MAJOR finding; compare the landmark polygon against the source curve.
- The tactile-oriented model must omit operational and technology markers that do not help blind navigation. Report Wi-Fi hotspots, CCTV, fire equipment, vending machines, and electrical fixtures as extra when they were emitted as features. An info-point must be a staffed visitor information or reception point.
- Audit every emitted door for direct visible evidence: a leaf and rooted swing arc, sliding panels at a wall gap, or an unmistakable open passage. A door inferred only because a room seems sealed is an extra MAJOR finding because it cuts a false gap into the tactile wall.
- Audit door POSITIONS, not just existence: a door must sit at the center of its drawn gap or swing. A door emitted at a wall corner or junction while the drawn gap is elsewhere on that wall is a misplaced finding (major — a blind reader would walk to the wrong spot). Two emitted doors within about a door-width of each other on the same small room usually means one drawn opening was reported twice: verify each against the source and report the extra.
- Audit source openings in every detail view as well as emitted doors. Two aligned wall strokes that visibly terminate around a plausible doorway-width gap are direct evidence of an open passage even without a swing arc. Report that opening as missing when the model has no door there. Do not promote an arbitrary missing boundary or large unbounded area to a door.
- Entrance/exit arrows at the building perimeter mark gates: where the drawing shows the perimeter open or gapped at an arrow, the model needs an opening there. An entrance feature with a solid extracted wall through its gate, when the source shows a gap, is a missing opening (major).
- Every drawn stair flight gets exactly one stairs feature. Tread lines (the short parallel rungs) must never be traced as walls; a cluster of short parallel walls over a drawn flight is an extra finding.
- A sealed room is not evidence of a missing door. Report a missing door only when the source visibly shows the opening.
- For EVERY finding, set "at" to the approximate [x, y] full-plan pixel location of the problem (the missing element's position, or the misplaced element's correct position). The refiner receives a zoomed crop centered there, so accurate coordinates directly improve the fix.
- Trace L-, U-, and T-shaped wall networks junction by junction. Check every short leg and stub; missing or disconnected segments are MAJOR when they change how a person would navigate.
- Check every curved wall and curved room boundary. A curve omitted or flattened to a single chord is a "misplaced" finding (or "missing" when absent) and severity "major" when it changes the navigable shape.
- severity "major" = would mislead a blind reader navigating (missing room, wall, door, or feature; badly wrong geometry). "minor" = cosmetic or small offsets.
- Use element ids from the JSON for extra/misplaced/mislabeled findings; elementId null for missing ones.
- confidenceAdjustments: for elements you verified match the plan well, raise confidence; for dubious ones, lower it. Only include elements you actually assessed.
- verdict "pass" when the model faithfully captures the plan's structure with no major findings.` + JSON_ONLY

export const critiqueAgent = new LlmAgent({
  name: 'floor_plan_critic',
  description: 'Compares a floor plan against a rendering of its extracted model',
  model: makeModel(MODEL_CRITICAL),
  instruction: CRITIQUE_INSTRUCTION,
  outputSchema: critiqueOutputSchema,
  generateContentConfig: {
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: -1 },
  },
})

export async function runCritique(params: {
  planParts: MessagePart[]
  overlayParts: MessagePart[]
  renderPngBase64: string
  modelJson: string
  structuralAudit?: string | null
}): Promise<Critique> {
  return withModelRetry(() => runCritiqueOnce(params))
}

async function runCritiqueOnce(params: {
  planParts: MessagePart[]
  overlayParts: MessagePart[]
  renderPngBase64: string
  modelJson: string
  structuralAudit?: string | null
}): Promise<Critique> {
  const finalText = await runAgentTurn({
    adkAgent: critiqueAgent,
    agentName: 'Critique',
    instruction: CRITIQUE_INSTRUCTION,
    parts: [
      { text: 'SOURCE FLOOR PLAN — full image followed by detail views:' },
      ...params.planParts,
      { text: 'ALIGNED TOPOLOGY OVERLAY:' },
      ...params.overlayParts,
      { text: 'EXTRACTED MODEL RENDER:' },
      { inlineData: { data: params.renderPngBase64, mimeType: 'image/png' } },
      ...(params.structuralAudit
        ? [{ text: params.structuralAudit }]
        : []),
      { text: `Extracted model JSON:\n${params.modelJson}` },
    ],
  })
  return parseAgentJson(critiqueSchema, finalText, 'Critique')
}
