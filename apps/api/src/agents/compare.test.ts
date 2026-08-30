import { describe, expect, test } from 'bun:test'

describe('real-map comparison result', () => {
  test('requires every score and bounds confidence', async () => {
    process.env.GEMINI_API_KEY ??= 'test-key'
    const { comparisonSchema } = await import('./compare')
    const valid = {
      confidence: 0.8,
      gaps: [],
      limitations: [],
      observableMatches: [],
      scores: {
        fabric: 7,
        informationSelection: 7,
        labels: 7,
        planFidelity: 7,
        readability: 7,
        realMapStructure: 7,
        symbols: 7,
      },
      strengths: [],
      verdict: 'Comparable.',
    }
    expect(comparisonSchema.safeParse(valid).success).toBe(true)
    const contradictory = comparisonSchema.parse({
      ...valid,
      overall: 10,
      scores: Object.fromEntries(
        Object.keys(valid.scores).map((key) => [key, 0]),
      ),
    })
    expect(contradictory.overall).toBe(0)
    expect(
      comparisonSchema.safeParse({ ...valid, confidence: 1.2 }).success,
    ).toBe(false)
  })

  test('rejects gaps without source provenance tags', async () => {
    process.env.GEMINI_API_KEY ??= 'test-key'
    const { comparisonSchema } = await import('./compare')
    const input = {
      confidence: 0.5,
      limitations: [],
      observableMatches: [],
      scores: {
        fabric: 5,
        informationSelection: 5,
        labels: 5,
        planFidelity: 5,
        readability: 5,
        realMapStructure: 5,
        symbols: 5,
      },
      strengths: [],
      verdict: 'Incomplete evidence.',
    }
    for (const gap of [
      'missing guide path',
      '[real-only]',
      '[real-only] [source-only] ambiguous',
    ]) {
      expect(comparisonSchema.safeParse({ ...input, gaps: [gap] }).success).toBe(false)
    }
  })
})
