import { z } from 'zod'
import { LlmAgent } from '@google/adk'
import {
  JSON_ONLY,
  makeModel,
  MODEL_COMPARE,
  parseAgentJson,
  runAgentTurn,
} from './llm'
import { withModelRetry } from './retry'

// Study-harness judge: scores our rendered tactile design against a
// photograph of the venue's real installed tactile map. The scores are
// the study's quality metric; the gaps feed the next engine iteration.

const scoreField = z.coerce.number().min(0).max(10)
const evidenceTag = /\[(source-and-real|real-only|source-only)\]/g
const gapField = z.string().refine(
  (gap) =>
    /^\[(source-and-real|real-only|source-only)\]\s+\S/.test(gap) &&
    (gap.match(evidenceTag)?.length ?? 0) === 1,
  'Gap must contain exactly one evidence tag followed by a description',
)

const rawComparisonSchema = z.object({
  scores: z.object({
    // Does our plate preserve the source plan's traceable geometry?
    planFidelity: scoreField,
    // Does our plate select and organize the same navigational structure
    // as the installed tactile map?
    realMapStructure: scoreField,
    // Does ours include the same navigation-critical information?
    informationSelection: scoreField,
    // Symbols match the conventions the real map uses (stairs, WC,
    // elevator, entrance, you-are-here)?
    symbols: scoreField,
    // Labeling system comparable (keys, legend, title, braille use)?
    labels: scoreField,
    // Connective fabric: paths/roads, textures, north, borders.
    fabric: scoreField,
    // Tactile readability: spacing, clutter, discriminability at
    // fingertip scale.
    readability: scoreField,
  }),
  confidence: z.coerce.number().min(0).max(1),
  observableMatches: z.array(z.string()).max(8).default([]),
  // What the real map has that ours lacks — most important first.
  gaps: z.array(gapField).max(8).default([]),
  // What ours does better or equally well.
  strengths: z.array(z.string()).max(6).default([]),
  limitations: z.array(z.string()).max(5).default([]),
  verdict: z.string(),
})

export const comparisonSchema = rawComparisonSchema.transform((result) => {
  const values = Object.values(result.scores)
  const overall = Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 10) / 10
  return { ...result, overall }
})

export type Comparison = z.infer<typeof comparisonSchema>

const INSTRUCTION = `You are a strict tactile-graphics evaluator auditing a machine-generated tactile map against both its source plan and the real, installed tactile map of the same venue.

IMAGE 1 is the SOURCE 2D floor/site plan that our parser received.
IMAGE 2 is a rendering of OUR generated tactile plate design (braille dots blue, walls/lines dark, low-relief areas beige, dashed lines raised guide paths, dashed frame plate margin).
IMAGE 3 is a photograph of the REAL tactile map installed at the venue (possibly angled, partial, or embedded in a document).

First determine whether all three images genuinely depict the same venue and comparable floor/site scope. If they do not, lower confidence, name the mismatch in limitations, and do not invent a correspondence.

Score OUR design 0-10 on every dimension:
- planFidelity: preservation of traceable geometry in IMAGE 1 — outlines, rooms/buildings, relative position, scale, entrances, connections.
- realMapStructure: agreement with the navigational organization visible in IMAGE 3.
- informationSelection: whether ours retains the same navigation-critical content the installed map prioritizes, rather than visual clutter.
- symbols: stairs, WC, elevator, entrance, you-are-here and other conventions.
- labels: braille keys, title, abbreviations and legend architecture.
- fabric: roads, paths, textures, orientation, boundaries and landmarks.
- readability: spacing, clutter, discriminability and plausible fingertip traversal.

Be strict and evidence-bound. A 9-10 means a blind reader familiar with the installed map could use ours interchangeably for the visible scope. A 5 preserves the broad layout but loses meaningful navigation detail or conventions. A 2 would not function as a map of this place. A validator-clean plate is not automatically realistic.

List observable matches before gaps. Gaps must be specific ("streets shown as textured bands with braille names"), not generic ("more detail"). Prefix every gap with exactly one evidence tag: [source-and-real] when the feature is visible in both IMAGE 1 and IMAGE 3, [real-only] when visible only in IMAGE 3, or [source-only] when visible only in IMAGE 1. A real-only difference may reduce installed-map parity scores, but it is not evidence of a parser failure; also record it as an unavailable-input limitation. Do not reduce planFidelity for a real-only feature.

Do not infer tactile texture, relief, braille, or raised geometry from color alone. Claim those properties only when contours, shadows, dot patterns, or other physical evidence are visible. Report confidence from 0 to 1 based on image clarity, scope match and completeness. Put occlusion, perspective, outdated plan dates and cross-floor mismatches in limitations, not gaps. If venue or floor scope is uncertain, confidence must not exceed 0.6.

Judge only what is visible. If IMAGE 3 shows only part of the real map, score only that part and state the limitation.

Output JSON:
{"scores": {"planFidelity": 0-10, "realMapStructure": 0-10, "informationSelection": 0-10, "symbols": 0-10, "labels": 0-10, "fabric": 0-10, "readability": 0-10}, "confidence": 0-1, "observableMatches": ["..."], "gaps": ["..."], "strengths": ["..."], "limitations": ["..."], "verdict": "one or two sentences"}` + JSON_ONLY

export const compareAgent = new LlmAgent({
  name: 'tactile_comparison',
  description: 'Scores a generated tactile design against the real installed map',
  model: makeModel(MODEL_COMPARE),
  instruction: INSTRUCTION,
  generateContentConfig: {
    temperature: 0.1,
    thinkingConfig: { thinkingBudget: -1 },
  },
})

export async function compareToRealMap(params: {
  sourcePngBase64: string
  sourceMime: string
  oursPngBase64: string
  oursMime: string
  realBase64: string
  realMime: string
  venueName: string
}): Promise<Comparison> {
  return withModelRetry(async () => {
    const finalText = await runAgentTurn({
      adkAgent: compareAgent,
      agentName: 'Comparison',
      instruction: INSTRUCTION,
      parts: [
        { text: `Venue: ${params.venueName}` },
        { text: 'IMAGE 1 — source floor/site plan:' },
        { inlineData: { data: params.sourcePngBase64, mimeType: params.sourceMime } },
        { text: 'IMAGE 2 — our generated tactile design:' },
        { inlineData: { data: params.oursPngBase64, mimeType: params.oursMime } },
        { text: 'IMAGE 3 — the real installed tactile map:' },
        { inlineData: { data: params.realBase64, mimeType: params.realMime } },
      ],
    })
    return parseAgentJson(comparisonSchema, finalText, 'Comparison')
  })
}
