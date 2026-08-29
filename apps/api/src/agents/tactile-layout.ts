import { z } from 'zod'
import { LlmAgent, InMemorySessionService, Runner } from '@google/adk'
import {
  resolveMechanicalViolations,
  validateTactileDesign,
  type TactileDesign,
  type ValidationContext,
  type ValidationViolation,
} from '@bumps/floor-model'
import { JSON_ONLY, makeModel, MODEL_CRITICAL, parseAgentJson } from './llm'
import { withModelRetry } from './retry'

export const MAX_LAYOUT_ITERATIONS = 4

// The agent may ONLY nudge braille labels and point symbols. It never touches
// lines, sizes, or heights — the validator (deterministic code) is the only
// authority on compliance.
// Tolerant of model dialects: numbers may arrive as strings, and some
// models shorten dxMm/dyMm to dx/dy.
const layoutOutputSchema = z.object({
  moves: z.array(
    z
      .object({
        elementId: z.string(),
        dxMm: z.coerce.number().optional(),
        dyMm: z.coerce.number().optional(),
        dx: z.coerce.number().optional(),
        dy: z.coerce.number().optional(),
      })
      .transform((m) => ({
        dxMm: m.dxMm ?? m.dx ?? 0,
        dyMm: m.dyMm ?? m.dy ?? 0,
        elementId: m.elementId,
      })),
  ),
})

const INSTRUCTION = `You fix layout violations on a tactile map plate for blind readers.

You receive the plate design as JSON (elements with positions in millimeters), the scaled room polygons, and a list of violations from a deterministic standards validator.

Propose moves — {elementId, dxMm, dyMm} — for braille labels (kind "braille") and point symbols (kind "symbol") ONLY. You cannot move lines, resize anything, or remove anything.

Guidance:
- Braille labels read left-to-right from their "at" (top-left corner); their footprint is roughly 8-14 mm wide and 6.5 mm tall. Keep each room's label INSIDE its room polygon.
- Keep >= 3 mm clear space between any two elements (>= 6 mm between same-kind symbols), and >= 3 mm from walls (lines).
- Door symbols may stay on their wall; do not move them off it unless a violation names them.
- Prefer the smallest moves that clear ALL listed violations. Move only elements involved in violations.
- Everything must stay inside the plate margin.` + JSON_ONLY

export const tactileLayoutAgent = new LlmAgent({
  name: 'tactile_layout',
  description: 'Nudges braille labels and symbols to clear standards violations',
  model: makeModel(MODEL_CRITICAL),
  instruction: INSTRUCTION,
  outputSchema: layoutOutputSchema,
  generateContentConfig: {
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: -1 },
  },
})

async function proposeMoves(
  design: TactileDesign,
  context: ValidationContext,
  violations: ValidationViolation[],
): Promise<z.infer<typeof layoutOutputSchema>['moves']> {
  return withModelRetry(async () => {
    const runner = new Runner({
      appName: 'bumps',
      agent: tactileLayoutAgent,
      sessionService: new InMemorySessionService(),
    })
    const message = [
      `Plate design JSON:\n${JSON.stringify(design)}`,
      `Room polygons (mm):\n${JSON.stringify(context.roomsMm)}`,
      `Violations:\n${JSON.stringify(violations)}`,
    ].join('\n\n')

    let finalText = ''
    for await (const event of runner.runEphemeral({
      userId: 'bumps',
      newMessage: { parts: [{ text: message }] },
    })) {
      if (event.errorMessage) {
        throw new Error(`Layout model error: ${event.errorMessage}`)
      }
      const text = event.content?.parts?.map((p) => p.text ?? '').join('')
      if (text) finalText = text
    }
    if (!finalText) throw new Error('Layout agent returned no output')
    return parseAgentJson(layoutOutputSchema, finalText, 'Layout agent').moves
  })
}

function applyMoves(
  design: TactileDesign,
  moves: { dxMm: number; dyMm: number; elementId: string }[],
): TactileDesign {
  const byId = new Map(moves.map((m) => [m.elementId, m]))
  return {
    ...design,
    elements: design.elements.map((element) => {
      const move = byId.get(element.id)
      if (!move) return element
      // Only braille and symbols are movable; ignore anything else.
      if (element.kind === 'braille' || element.kind === 'symbol') {
        return {
          ...element,
          at: { x: element.at.x + move.dxMm, y: element.at.y + move.dyMm },
        }
      }
      return element
    }),
  }
}

export type LayoutResult = {
  design: TactileDesign
  iterations: { moves: number; violations: number }[]
  valid: boolean
  violations: ValidationViolation[]
}

export async function runTactileLayout(
  initial: TactileDesign,
  context: ValidationContext,
): Promise<LayoutResult> {
  let design = initial
  let violations = validateTactileDesign(design, context)
  const iterations: { moves: number; violations: number }[] = [
    { moves: 0, violations: violations.length },
  ]

  // The scale gate cannot be fixed by moving things — fail immediately.
  if (violations.some((v) => v.rule === 'scale')) {
    return { design, iterations, valid: false, violations }
  }

  // Geometry disposes first: seam-clearance is pure arithmetic, so it is
  // repaired deterministically; the agent only sees what needs judgment.
  const mechanicalPass = () => {
    const fixed = resolveMechanicalViolations(design, context)
    if (fixed !== design) {
      const fixedViolations = validateTactileDesign(fixed, context)
      if (fixedViolations.length <= violations.length) {
        design = fixed
        violations = fixedViolations
      }
    }
  }
  mechanicalPass()

  for (
    let iteration = 0;
    violations.length > 0 && iteration < MAX_LAYOUT_ITERATIONS;
    iteration++
  ) {
    const moves = await proposeMoves(design, context, violations)
    const candidate = applyMoves(design, moves)
    const candidateViolations = validateTactileDesign(candidate, context)
    // Never accept a step that makes things worse.
    if (candidateViolations.length <= violations.length) {
      design = candidate
      violations = candidateViolations
    }
    mechanicalPass()
    iterations.push({ moves: moves.length, violations: violations.length })
  }

  return { design, iterations, valid: violations.length === 0, violations }
}
