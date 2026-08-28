import { allElements, type FloorElement, type FloorModel } from './schema'

// Elements below this are flagged for human review and gate the wizard.
export const NEEDS_REVIEW_THRESHOLD = 0.7

// The parse loop stops refining once the mean confidence reaches this.
export const PARSE_TARGET_CONFIDENCE = 0.85

export function aggregateConfidence(model: FloorModel): number {
  const elements = allElements(model)
  if (elements.length === 0) return 0
  const total = elements.reduce((sum, element) => sum + element.confidence, 0)
  return total / elements.length
}

export function elementsNeedingReview(model: FloorModel): FloorElement[] {
  return allElements(model).filter(
    (element) => element.confidence < NEEDS_REVIEW_THRESHOLD,
  )
}
