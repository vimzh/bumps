import { describe, expect, mock, test } from 'bun:test'
import { sampleFloorModel } from '@bumps/floor-model'

const parser = await import('./parser')
const critique = await import('./critique')

mock.module('./parser', () => ({
  ...parser,
  loadPlanImagePart: async () => ({ data: 'unused', mimeType: 'image/png' }),
  loadPlanImageParts: async () => [
    { inlineData: { data: 'unused', mimeType: 'image/png' } },
    { text: 'report coordinates in the FULL PLAN space' },
    ...Array.from({ length: 4 }, () => ({
      inlineData: { data: 'unused', mimeType: 'image/png' },
    })),
  ],
  parsePlanImage: async () => sampleFloorModel,
  refineParse: async () => sampleFloorModel,
}))

mock.module('./critique', () => ({
  ...critique,
  runCritique: async () => ({
    confidenceAdjustments: [],
    findings: [
      {
        description: 'A navigation-changing doorway is still missing.',
        elementId: null,
        kind: 'missing',
        severity: 'major',
      },
    ],
    verdict: 'needs_refinement',
  }),
}))

describe('parse review gate', () => {
  test('does not accept a parse with unresolved major findings at the iteration limit', async () => {
    const { MAX_ITERATIONS, runParseLoop } = await import('./parse-loop')
    let savedIterations = 0

    await expect(
      runParseLoop({
        dimensions: { heightPx: 800, widthPx: 1000 },
        onProgress: async () => {},
        planPath: '/tmp/plan.png',
        saveIteration: async () => {
          savedIterations += 1
        },
      }),
    ).rejects.toThrow('major finding')
    expect(savedIterations).toBe(MAX_ITERATIONS)
  })
})
