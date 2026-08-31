import { Resvg } from '@resvg/resvg-js'
import {
  aggregateConfidence,
  allElements,
  auditFloorModel,
  elementPosition,
  normalizeFloorModel,
  PARSE_TARGET_CONFIDENCE,
  renderFloorModelSvg,
  renderFloorTopologyOverlaySvg,
  type FloorModel,
} from '@bumps/floor-model'
import { computeInkCoverage, type CoverageReport } from '../lib/coverage'
import { cropPlanImage } from '../lib/rasterize'
import type { MessagePart } from './llm'
import { runCritique, type Critique } from './critique'
import { applyOpeningsAudit, runOpeningsAudit } from './openings-audit'
import {
  loadPlanImageParts,
  parsePlanImage,
  refineParse,
} from './parser'

// Reviewed-iteration cap. Three rounds resolve nearly all majors in
// practice; anything left is editor material, and each extra round is two
// image-heavy model calls.
export const MAX_ITERATIONS = 3

export type ParseStage = 'parsing' | 'critiquing' | 'refining'

export type IterationSummary = {
  iteration: number
  aggregateConfidence: number
  findingsCount: number
  majorCount: number
  verdict: Critique['verdict']
}

export type ParseProgress = {
  stage: ParseStage
  iteration: number
  maxIterations: number
  aggregateConfidence: number | null
  history: IterationSummary[]
}

function applyConfidenceAdjustments(
  model: FloorModel,
  critique: Critique,
): FloorModel {
  if (critique.confidenceAdjustments.length === 0) return model
  const byId = new Map(
    critique.confidenceAdjustments.map((a) => [a.elementId, a.confidence]),
  )
  const adjust = <T extends { id: string; confidence: number }>(items: T[]) =>
    items.map((item) =>
      byId.has(item.id) ? { ...item, confidence: byId.get(item.id)! } : item,
    )
  return {
    ...model,
    walls: adjust(model.walls),
    openings: adjust(model.openings),
    rooms: adjust(model.rooms),
    features: adjust(model.features),
    furniture: adjust(model.furniture ?? []),
    paths: adjust(model.paths ?? []),
    roads: adjust(model.roads ?? []),
  }
}

function renderModelPngBase64(model: FloorModel): string {
  const svg = renderFloorModelSvg(model)
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: model.plan.widthPx },
  })
    .render()
    .asPng()
  return Buffer.from(png).toString('base64')
}

// Full overlay only: the plan detail crops plus the deterministic audit
// carry the fine-grained signal, and four extra overlay crops per critique
// were the single largest token cost in the loop.
function renderTopologyOverlayParts(
  model: FloorModel,
  source: Extract<MessagePart, { inlineData: unknown }>['inlineData'],
): MessagePart[] {
  const svg = renderFloorTopologyOverlaySvg(
    model,
    `data:${source.mimeType};base64,${source.data}`,
  )
  const png = new Uint8Array(new Resvg(svg, {
    fitTo: { mode: 'width', value: model.plan.widthPx },
  })
    .render()
    .asPng())
  return [
    { inlineData: { data: Buffer.from(png).toString('base64'), mimeType: 'image/png' } },
  ]
}

// Accept-with-warnings gate at the iteration cap: a broadly confident
// model with a handful of residual majors flags them for the human; a
// low-confidence or major-riddled model (the fabrication signature seen on
// transit diagrams) still fails outright.
export const ACCEPT_WITH_WARNINGS_MIN_CONFIDENCE = 0.75
export const ACCEPT_WITH_WARNINGS_MAX_MAJORS = 6

/**
 * Caps the confidence of every element a remaining major finding points
 * at, so the wizard's review queue surfaces exactly those places.
 */
export function flagFindingsForReview(
  model: FloorModel,
  critique: Critique,
): FloorModel {
  const flagged = new Set(
    critique.findings
      .filter((f) => f.severity === 'major' && f.elementId)
      .map((f) => f.elementId!),
  )
  if (flagged.size === 0) return model
  const cap = <T extends { id: string; confidence: number }>(items: T[]) =>
    items.map((item) =>
      flagged.has(item.id)
        ? { ...item, confidence: Math.min(item.confidence, 0.55) }
        : item,
    )
  return {
    ...model,
    features: cap(model.features),
    furniture: cap(model.furniture ?? []),
    openings: cap(model.openings),
    paths: cap(model.paths ?? []),
    roads: cap(model.roads ?? []),
    rooms: cap(model.rooms),
    walls: cap(model.walls),
  }
}

export function shouldStop(
  critique: Critique,
  aggregate: number,
  iteration: number,
): boolean {
  const hasMajor = critique.findings.some((f) => f.severity === 'major')
  if (hasMajor) return false
  if (critique.verdict === 'pass') return true
  if (aggregate >= PARSE_TARGET_CONFIDENCE) return true
  // Credit guard: once two reviewed iterations leave only minor findings,
  // another parse+critique round buys cosmetics the editor handles better.
  return iteration >= 2
}

/**
 * Deterministic mechanical cleanup of a fresh parse; a normalization bug
 * must degrade to the raw model, never fail the parse.
 */
function normalizeSafely(model: FloorModel): { model: FloorModel; notes: string[] } {
  try {
    return normalizeFloorModel(model)
  } catch (error) {
    console.error('[parse] model normalization failed; using raw parse', error)
    return { model, notes: [] }
  }
}

/**
 * Magnified crops at reviewer-finding locations so the refiner sees real
 * pixels at each problem site instead of relying on the whole-plan views.
 */
function findingZoomParts(
  planBytes: Uint8Array,
  mimeType: string,
  model: FloorModel,
  findings: Critique['findings'],
): MessagePart[] {
  const { heightPx, widthPx } = model.plan
  const ordered = [...findings].sort(
    (a, b) => Number(b.severity === 'major') - Number(a.severity === 'major'),
  )
  const parts: MessagePart[] = []
  const used: { x: number; y: number }[] = []
  for (const finding of ordered) {
    const at =
      finding.at ??
      (finding.elementId ? elementPosition(model, finding.elementId) : null)
    if (!at) continue
    if (used.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < 150)) continue
    const half = 190
    const x0 = Math.max(0, Math.round(at.x - half))
    const y0 = Math.max(0, Math.round(at.y - half))
    const x1 = Math.min(widthPx, Math.round(at.x + half))
    const y1 = Math.min(heightPx, Math.round(at.y + half))
    if (x1 - x0 < 40 || y1 - y0 < 40) continue
    let crop: Uint8Array
    try {
      crop = cropPlanImage(
        planBytes,
        mimeType,
        {
          height: (y1 - y0) / heightPx,
          left: x0 / widthPx,
          top: y0 / heightPx,
          width: (x1 - x0) / widthPx,
        },
        800,
      )
    } catch {
      continue
    }
    used.push(at)
    parts.push(
      {
        text: `FINDING ZOOM — full-plan pixel bounds x=${x0}..${x1}, y=${y0}..${y1}; finding: ${finding.description.slice(0, 200)}`,
      },
      { inlineData: { data: Buffer.from(crop).toString('base64'), mimeType: 'image/png' } },
    )
    if (used.length >= 4) break
  }
  return parts.length > 0
    ? [
        {
          text: 'ZOOMED SOURCE VIEWS AT REVIEWER FINDINGS — use these to fix each finding precisely; report coordinates in FULL PLAN space:',
        },
        ...parts,
      ]
    : []
}

/**
 * One final doors-and-gates verification on the accepted model. Failure
 * degrades to the unaudited model — acceptance is never blocked by it.
 */
async function auditAcceptedOpenings(
  model: FloorModel,
  planBytes: Uint8Array,
  mimeType: string,
): Promise<{ changed: boolean; model: FloorModel }> {
  try {
    const ops = await runOpeningsAudit({ mimeType, model, planBytes })
    const applied = applyOpeningsAudit(model, ops)
    if (applied.notes.length > 0) {
      console.log(`[parse] openings audit: ${applied.notes.join('; ')}`)
    }
    const changed =
      JSON.stringify(applied.model.openings) !== JSON.stringify(model.openings)
    if (!changed) return { changed: false, model }
    return { changed: true, model: normalizeSafely(applied.model).model }
  } catch (error) {
    console.error('[parse] openings audit failed; keeping accepted model', error)
    return { changed: false, model }
  }
}

/**
 * Code-computed attention hints for the critique and refine agents:
 * geometric audit findings, pixel-coverage gaps, and what normalization
 * already fixed. Returns null when there is nothing worth flagging.
 */
function buildStructuralAudit(
  model: FloorModel,
  planBytes: Uint8Array | null,
  mimeType: string | null,
  notes: string[],
): string | null {
  const lines: string[] = []
  try {
    for (const finding of auditFloorModel(model)) {
      lines.push(`- [${finding.kind}] ${finding.message}`)
    }
  } catch (error) {
    console.error('[parse] structural audit failed', error)
  }

  let coverage: CoverageReport | null = null
  if (planBytes && mimeType) {
    try {
      coverage = computeInkCoverage(planBytes, mimeType, model)
    } catch (error) {
      console.error('[parse] coverage audit failed', error)
    }
  }
  if (coverage) {
    const percent = Math.round(coverage.coveredInkRatio * 100)
    if (coverage.regions.length > 0) {
      const boxes = coverage.regions
        .map((r) => `x ${r.x0}-${r.x1}, y ${r.y0}-${r.y1}`)
        .join('; ')
      lines.push(
        `- [coverage] Extracted geometry accounts for ~${percent}% of the source's dark linework. Densest uncovered linework (full-plan pixels): ${boxes}. Each region may be a missed wall, room, or symbol — or just text, dimensioning, or hatching; judge from the image.`,
      )
    } else if (coverage.coveredInkRatio < 0.5) {
      lines.push(
        `- [coverage] Extracted geometry accounts for only ~${percent}% of the source's dark linework, spread diffusely. Check whether whole element classes were under-extracted.`,
      )
    }
  }

  for (const note of notes) {
    lines.push(`- [normalization] Code already ${note}.`)
  }
  if (lines.length === 0) return null
  return `DETERMINISTIC STRUCTURAL AUDIT — computed by code from the extracted geometry and a pixel-coverage comparison. These are attention directives, NOT confirmed errors: verify each against the source image and dismiss any the image does not support.\n${lines.join('\n')}`
}

export async function runParseLoop(params: {
  planPath: string
  dimensions: { widthPx: number; heightPx: number }
  onProgress: (progress: ParseProgress) => Promise<void>
  saveIteration: (
    model: FloorModel,
    iteration: number,
    critique: Critique | null,
  ) => Promise<void>
}): Promise<void> {
  const { dimensions, onProgress, planPath, saveIteration } = params
  const history: IterationSummary[] = []
  const progress = async (
    stage: ParseStage,
    iteration: number,
    aggregate: number | null,
  ) =>
    onProgress({
      aggregateConfidence: aggregate,
      history,
      iteration,
      maxIterations: MAX_ITERATIONS,
      stage,
    })

  await progress('parsing', 1, null)
  const parsed = normalizeSafely(await parsePlanImage(planPath, dimensions))
  let model = parsed.model
  let normalizationNotes = parsed.notes
  const planParts = await loadPlanImageParts(planPath)
  const source = planParts.find(
    (part): part is Extract<MessagePart, { inlineData: unknown }> =>
      'inlineData' in part,
  )?.inlineData
  if (!source) throw new Error('Parser did not load the source plan image')
  const planBytes = Buffer.from(source.data, 'base64')

  // The last model a critique actually reviewed, for salvage when a later
  // model call dies mid-loop (credit exhaustion, provider outage): reviewed
  // work is never thrown away if it meets the accept-with-warnings bar.
  let lastReviewed: { critique: Critique; model: FloorModel } | null = null
  const salvageLastReviewed = async (cause: string): Promise<boolean> => {
    if (!lastReviewed) return false
    const aggregate = aggregateConfidence(lastReviewed.model)
    const majors = lastReviewed.critique.findings.filter(
      (f) => f.severity === 'major',
    ).length
    if (
      aggregate < ACCEPT_WITH_WARNINGS_MIN_CONFIDENCE ||
      majors > ACCEPT_WITH_WARNINGS_MAX_MAJORS
    ) {
      return false
    }
    console.warn(
      `[parse] ${cause}; salvaging last reviewed model with ${majors} major finding${majors === 1 ? '' : 's'} flagged`,
    )
    const flagged = flagFindingsForReview(lastReviewed.model, lastReviewed.critique)
    const audited = await auditAcceptedOpenings(flagged, planBytes, source.mimeType)
    await saveIteration(audited.model, MAX_ITERATIONS + 1, null)
    return true
  }

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    await progress('critiquing', iteration, aggregateConfidence(model))
    const structuralAudit = buildStructuralAudit(
      model,
      planBytes,
      source.mimeType,
      normalizationNotes,
    )
    let critique: Critique
    try {
      critique = await runCritique({
        modelJson: JSON.stringify(model),
        overlayParts: renderTopologyOverlayParts(model, source),
        planParts,
        renderPngBase64: renderModelPngBase64(model),
        structuralAudit,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (await salvageLastReviewed(`critique failed (${message.slice(0, 120)})`)) {
        return
      }
      throw new Error(`Critique unavailable; parse was not accepted: ${message}`)
    }
    // Drop adjustments pointing at ids that don't exist.
    const validIds = new Set(allElements(model).map((e) => e.id))
    critique.confidenceAdjustments = critique.confidenceAdjustments.filter(
      (a) => validIds.has(a.elementId),
    )
    model = applyConfidenceAdjustments(model, critique)
    lastReviewed = { critique, model }
    const aggregate = aggregateConfidence(model)
    history.push({
      aggregateConfidence: aggregate,
      findingsCount: critique.findings.length,
      iteration,
      majorCount: critique.findings.filter((f) => f.severity === 'major').length,
      verdict: critique.verdict,
    })
    await saveIteration(model, iteration, critique)

    const majorCount = critique.findings.filter(
      (finding) => finding.severity === 'major',
    ).length
    const accepted =
      shouldStop(critique, aggregate, iteration) ||
      (iteration === MAX_ITERATIONS && majorCount === 0)
    // At the iteration cap a broadly-sound model with residual majors is
    // still far more useful flagged for human review than a hard failure —
    // the editor exists exactly for this. Persistent low confidence or a
    // pile of majors still fails: that is the fabrication signature.
    const acceptedWithWarnings =
      !accepted &&
      iteration === MAX_ITERATIONS &&
      aggregate >= ACCEPT_WITH_WARNINGS_MIN_CONFIDENCE &&
      majorCount <= ACCEPT_WITH_WARNINGS_MAX_MAJORS
    if (accepted || acceptedWithWarnings) {
      if (acceptedWithWarnings) {
        model = flagFindingsForReview(model, critique)
        console.warn(
          `[parse] accepted with warnings: ${majorCount} major finding${majorCount === 1 ? '' : 's'} flagged for review`,
        )
      }
      const audited = await auditAcceptedOpenings(
        model,
        planBytes,
        source.mimeType,
      )
      if (audited.changed || acceptedWithWarnings) {
        await saveIteration(audited.model, iteration + 1, null)
      }
      return
    }
    if (iteration === MAX_ITERATIONS) {
      throw new Error(
        `Parse did not pass review after ${MAX_ITERATIONS} iterations: ${majorCount} major finding${majorCount === 1 ? '' : 's'} remain`,
      )
    }
    await progress('refining', iteration + 1, aggregate)
    try {
      const refined = normalizeSafely(
        await refineParse(
          planPath,
          dimensions,
          model,
          JSON.stringify(critique.findings),
          structuralAudit,
          findingZoomParts(planBytes, source.mimeType, model, critique.findings),
        ),
      )
      model = refined.model
      normalizationNotes = refined.notes
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (await salvageLastReviewed(`refinement failed (${message.slice(0, 120)})`)) {
        return
      }
      throw new Error(`Refinement failed; reviewed parse was saved: ${message}`)
    }
  }
}
