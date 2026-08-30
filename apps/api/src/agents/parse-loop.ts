import { Resvg } from '@resvg/resvg-js'
import {
  aggregateConfidence,
  allElements,
  PARSE_TARGET_CONFIDENCE,
  renderFloorModelSvg,
  renderFloorTopologyOverlaySvg,
  type FloorModel,
} from '@bumps/floor-model'
import { cropPlanImage } from '../lib/rasterize'
import type { MessagePart } from './llm'
import { runCritique, type Critique } from './critique'
import {
  DETAIL_CROPS,
  loadPlanImageParts,
  parsePlanImage,
  refineParse,
} from './parser'

export const MAX_ITERATIONS = 5

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
  const parts: MessagePart[] = [
    { inlineData: { data: Buffer.from(png).toString('base64'), mimeType: 'image/png' } },
  ]
  if (Math.max(model.plan.widthPx, model.plan.heightPx) < 1200) return parts

  for (const { crop, label } of DETAIL_CROPS) {
    parts.push(
      { text: `OVERLAY DETAIL — ${label}` },
      {
        inlineData: {
          data: Buffer.from(cropPlanImage(png, 'image/png', crop)).toString(
            'base64',
          ),
          mimeType: 'image/png',
        },
      },
    )
  }
  return parts
}

function shouldStop(critique: Critique, aggregate: number): boolean {
  const hasMajor = critique.findings.some((f) => f.severity === 'major')
  if (critique.verdict === 'pass' && !hasMajor) return true
  return aggregate >= PARSE_TARGET_CONFIDENCE && !hasMajor
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
  let model = await parsePlanImage(planPath, dimensions)
  const planParts = await loadPlanImageParts(planPath)
  const source = planParts.find(
    (part): part is Extract<MessagePart, { inlineData: unknown }> =>
      'inlineData' in part,
  )?.inlineData
  if (!source) throw new Error('Parser did not load the source plan image')

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    await progress('critiquing', iteration, aggregateConfidence(model))
    let critique: Critique
    try {
      critique = await runCritique({
        modelJson: JSON.stringify(model),
        overlayParts: renderTopologyOverlayParts(model, source),
        planParts,
        renderPngBase64: renderModelPngBase64(model),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Critique unavailable; parse was not accepted: ${message}`)
    }
    // Drop adjustments pointing at ids that don't exist.
    const validIds = new Set(allElements(model).map((e) => e.id))
    critique.confidenceAdjustments = critique.confidenceAdjustments.filter(
      (a) => validIds.has(a.elementId),
    )
    model = applyConfidenceAdjustments(model, critique)
    const aggregate = aggregateConfidence(model)
    history.push({
      aggregateConfidence: aggregate,
      findingsCount: critique.findings.length,
      iteration,
      majorCount: critique.findings.filter((f) => f.severity === 'major').length,
      verdict: critique.verdict,
    })
    await saveIteration(model, iteration, critique)

    if (shouldStop(critique, aggregate)) {
      return
    }
    if (iteration === MAX_ITERATIONS) {
      const majorCount = critique.findings.filter(
        (finding) => finding.severity === 'major',
      ).length
      if (majorCount > 0) {
        throw new Error(
          `Parse did not pass review after ${MAX_ITERATIONS} iterations: ${majorCount} major finding${majorCount === 1 ? '' : 's'} remain`,
        )
      }
      return
    }
    await progress('refining', iteration + 1, aggregate)
    try {
      model = await refineParse(
        planPath,
        dimensions,
        model,
        JSON.stringify(critique.findings),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Refinement failed; reviewed parse was saved: ${message}`)
    }
  }
}
