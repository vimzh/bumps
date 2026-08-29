import { Resvg } from '@resvg/resvg-js'
import {
  aggregateConfidence,
  allElements,
  PARSE_TARGET_CONFIDENCE,
  renderFloorModelSvg,
  type FloorModel,
} from '@bumps/floor-model'
import { runCritique, type Critique } from './critique'
import { loadPlanImagePart, parsePlanImage, refineParse } from './parser'

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
  const plan = await loadPlanImagePart(planPath)

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    await progress('critiquing', iteration, aggregateConfidence(model))
    let critique: Critique
    try {
      critique = await runCritique({
        modelJson: JSON.stringify(model),
        planMime: plan.mimeType,
        planPngBase64: plan.data,
        renderPngBase64: renderModelPngBase64(model),
      })
    } catch (error) {
      // A parse without a review beats no parse at all: keep the model,
      // skip further refinement, and let the user review it by hand.
      console.error(
        '[parse-loop] critique unavailable, accepting parse as-is:',
        error instanceof Error ? error.message.slice(0, 200) : error,
      )
      await saveIteration(model, iteration, null)
      return
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

    if (shouldStop(critique, aggregate) || iteration === MAX_ITERATIONS) {
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
      // Refinement failing (quota, transient) should not lose the model
      // we already have — the saved iteration stands.
      console.error(
        '[parse-loop] refinement unavailable, keeping current model:',
        error instanceof Error ? error.message.slice(0, 200) : error,
      )
      return
    }
  }
}
