import { describe, expect, test } from 'bun:test'

describe('plan input quality gate', () => {
  test('accepts traceable plans and rejects perspective or unusable inputs', async () => {
    process.env.GEMINI_API_KEY ??= 'test-key'
    const { assertUsablePlanInput } = await import('./parser')
    expect(() =>
      assertUsablePlanInput({
        drawingType: 'floor-plan',
        suitability: 'usable',
        suitabilityIssues: ['low resolution'],
      }),
    ).not.toThrow()
    expect(() =>
      assertUsablePlanInput({
        drawingType: 'not-a-plan',
        suitability: 'poor',
        suitabilityIssues: ['isometric perspective'],
      }),
    ).toThrow('isometric perspective')
  })

  test('uses zoomed structure views without encouraging inferred doors', async () => {
    process.env.GEMINI_API_KEY ??= 'test-key'
    const { loadPlanImageParts, PARSER_INSTRUCTION } = await import('./parser')
    const { CRITIQUE_INSTRUCTION } = await import('./critique')

    expect(PARSER_INSTRUCTION).toContain('A door requires DIRECT VISIBLE EVIDENCE')
    expect(PARSER_INSTRUCTION).toContain('L-, U-, and T-shaped walls')
    expect(PARSER_INSTRUCTION).toContain(
      'A round fountain, circular desk, round planter, or curved counter',
    )
    expect(PARSER_INSTRUCTION).not.toContain(
      'Almost every enclosed room has at least one door',
    )
    // Evidence tiers: gap-evidenced doors are emitted at review-flag
    // confidence instead of being either invented or dropped.
    expect(PARSER_INSTRUCTION).toContain('confidence 0.5-0.7')
    expect(PARSER_INSTRUCTION).toContain('SIGNIFICANCE FILTER')
    expect(PARSER_INSTRUCTION).toContain('Notation dialects')
    expect(PARSER_INSTRUCTION).toContain('Sweep order')
    expect(CRITIQUE_INSTRUCTION).toContain('DETERMINISTIC STRUCTURAL AUDIT')
    expect(CRITIQUE_INSTRUCTION).toContain(
      'Never copy an audit line into findings without image evidence',
    )
    // Door-precision, gate, and stair-tread rules from the Harris study.
    expect(PARSER_INSTRUCTION).toContain('POSITION PRECISION')
    expect(PARSER_INSTRUCTION).toContain('NEVER trace stair treads as walls')
    expect(CRITIQUE_INSTRUCTION).toContain('arrows at the building perimeter mark gates')
    expect(CRITIQUE_INSTRUCTION).toContain('set "at" to the approximate [x, y]')
    expect(CRITIQUE_INSTRUCTION).toContain(
      'A sealed room is not evidence of a missing door',
    )
    expect(CRITIQUE_INSTRUCTION).toContain(
      'A round fountain, circular planter, circular desk, or curved counter',
    )

    const parts = await loadPlanImageParts('pipeline_tests/outputs/psu-input.png')
    expect(parts.filter((part) => 'inlineData' in part)).toHaveLength(5)
    expect(parts.filter((part) => 'text' in part).map((part) => part.text).join(' ')).toContain(
      'report coordinates in the FULL PLAN space',
    )
  })

  test('treats missing structural geometry as major', async () => {
    process.env.GEMINI_API_KEY ??= 'test-key'
    const { critiqueSchema } = await import('./critique')
    const critique = critiqueSchema.parse({
      verdict: 'pass',
      findings: [
        {
          description: 'Missing door between the ballroom and hall',
          kind: 'missing',
          severity: 'minor',
        },
      ],
    })

    expect(critique.findings[0]?.severity).toBe('major')
  })
})
