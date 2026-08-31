import { describe, expect, mock, setDefaultTimeout, test } from 'bun:test'
import { sampleFloorModel, type FloorModel } from '@bumps/floor-model'

const parser = await import('./parser')
const critique = await import('./critique')

setDefaultTimeout(15_000)

type MockFinding = {
  at: { x: number; y: number } | null
  description: string
  elementId: string | null
  kind: 'missing' | 'extra' | 'misplaced' | 'mislabeled'
  severity: 'major' | 'minor'
}

// Mutable so each test can steer what the mocked critic keeps reporting.
const mockState: { findings: MockFinding[] } = { findings: [] }

mock.module('./parser', () => ({
  ...parser,
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
    findings: mockState.findings,
    verdict: 'needs_refinement',
  }),
}))

function majorFinding(elementId: string | null): MockFinding {
  return {
    at: null,
    description: 'A navigation-changing element is still wrong.',
    elementId,
    kind: 'missing',
    severity: 'major',
  }
}

describe('parse review gate', () => {
  test('caps parsing at five review passes', async () => {
    const { MAX_ITERATIONS } = await import('./parse-loop')
    expect(MAX_ITERATIONS).toBe(5)
  })

  test('accepts with warnings at the iteration limit, flagging the majors for review', async () => {
    const { MAX_ITERATIONS, runParseLoop } = await import('./parse-loop')
    mockState.findings = [majorFinding('w-div-bottom')]
    const saved: FloorModel[] = []

    await runParseLoop({
      dimensions: { heightPx: 800, widthPx: 1000 },
      onProgress: async () => {},
      planPath: '/tmp/plan.png',
      saveIteration: async (model) => {
        saved.push(model)
      },
    })
    // MAX reviewed iterations plus the flagged final save.
    expect(saved).toHaveLength(MAX_ITERATIONS + 1)
    const flagged = saved
      .at(-1)!
      .walls.find((wall) => wall.id === 'w-div-bottom')!
    expect(flagged.confidence).toBeLessThanOrEqual(0.55)
  })

  test('salvages the last reviewed model when a later model call dies', async () => {
    const { MAX_ITERATIONS, runParseLoop } = await import('./parse-loop')
    mockState.findings = [majorFinding('w-div-bottom')]
    // First critique succeeds; the refine that follows dies (credits gone).
    const originalRefine = (await import('./parser')).refineParse
    mock.module('./parser', () => ({
      ...parser,
      loadPlanImageParts: async () => [
        { inlineData: { data: 'unused', mimeType: 'image/png' } },
        { text: 'report coordinates in the FULL PLAN space' },
      ],
      parsePlanImage: async () => sampleFloorModel,
      refineParse: async () => {
        throw new Error('OpenRouter error 402: This request requires more credits')
      },
    }))
    try {
      const saved: FloorModel[] = []
      await runParseLoop({
        dimensions: { heightPx: 800, widthPx: 1000 },
        onProgress: async () => {},
        planPath: '/tmp/plan.png',
        saveIteration: async (model) => {
          saved.push(model)
        },
      })
      // One reviewed iteration plus the salvaged flagged save.
      expect(saved).toHaveLength(2)
      const flagged = saved.at(-1)!.walls.find((w) => w.id === 'w-div-bottom')!
      expect(flagged.confidence).toBeLessThanOrEqual(0.55)
      expect(MAX_ITERATIONS).toBeGreaterThan(1)
    } finally {
      mock.module('./parser', () => ({
        ...parser,
        loadPlanImageParts: async () => [
          { inlineData: { data: 'unused', mimeType: 'image/png' } },
          { text: 'report coordinates in the FULL PLAN space' },
          ...Array.from({ length: 4 }, () => ({
            inlineData: { data: 'unused', mimeType: 'image/png' },
          })),
        ],
        parsePlanImage: async () => sampleFloorModel,
        refineParse: originalRefine,
      }))
    }
  })

  test('still fails at the limit when majors pile up (fabrication signature)', async () => {
    const { ACCEPT_WITH_WARNINGS_MAX_MAJORS, runParseLoop } = await import(
      './parse-loop'
    )
    mockState.findings = Array.from(
      { length: ACCEPT_WITH_WARNINGS_MAX_MAJORS + 1 },
      (_, i) => majorFinding(`fake-${i}`),
    )
    await expect(
      runParseLoop({
        dimensions: { heightPx: 800, widthPx: 1000 },
        onProgress: async () => {},
        planPath: '/tmp/plan.png',
        saveIteration: async () => {},
      }),
    ).rejects.toThrow('major findings remain')
  })

  test('keeps refining majors but stops paying for minor-only rounds after two reviews', async () => {
    const { shouldStop } = await import('./parse-loop')
    const minorOnly = {
      confidenceAdjustments: [],
      findings: [
        {
          at: null,
          description: 'Furniture block slightly oversized',
          elementId: 'fur-1',
          kind: 'misplaced' as const,
          severity: 'minor' as const,
        },
      ],
      verdict: 'needs_refinement' as const,
    }
    expect(shouldStop(minorOnly, 0.6, 1)).toBe(false)
    expect(shouldStop(minorOnly, 0.6, 2)).toBe(true)
    expect(
      shouldStop(
        {
          ...minorOnly,
          findings: [{ ...minorOnly.findings[0]!, severity: 'major' as const }],
        },
        0.95,
        4,
      ),
    ).toBe(false)
  })
})
