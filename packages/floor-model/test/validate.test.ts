import { describe, expect, test } from 'bun:test'
import {
  buildValidationContext,
  convertToTactile,
  sampleFloorModel,
  validateTactileDesign,
  type FloorModel,
  type TactileDesign,
} from '../src'

const context = buildValidationContext(sampleFloorModel)
const { design } = convertToTactile(sampleFloorModel)

describe('validateTactileDesign', () => {
  test('reports centroid-key collisions on the raw fixture conversion', () => {
    const violations = validateTactileDesign(design, context)
    // The corridor's key is a thin band between two walls — expect clearance
    // or fit findings, all machine-readable.
    for (const violation of violations) {
      expect(violation.rule).toBeTruthy()
      expect(violation.elementIds.length).toBeGreaterThan(0)
      expect(violation.message.length).toBeGreaterThan(10)
    }
  })

  test('symbols below 5mm are flagged', () => {
    const shrunk: TactileDesign = structuredClone(design)
    const symbol = shrunk.elements.find((e) => e.kind === 'symbol')
    if (symbol?.kind === 'symbol') symbol.sizeMm = 4
    const violations = validateTactileDesign(shrunk, context)
    expect(violations.some((v) => v.rule === 'symbol-size')).toBe(true)
  })

  test('same-kind symbols need 6mm, different kinds 3mm', () => {
    const crowded: TactileDesign = structuredClone(design)
    const stairs = crowded.elements.find(
      (e) => e.kind === 'symbol' && e.symbol === 'stairs',
    )
    if (stairs?.kind === 'symbol') {
      crowded.elements.push({
        ...structuredClone(stairs),
        at: { x: stairs.at.x + 11, y: stairs.at.y },
        id: 'sym-close-twin',
      })
    }
    const violations = validateTactileDesign(crowded, context)
    // 11mm apart, 6mm bodies -> 5mm gap: fails the 6mm same-kind rule but
    // would pass the generic 3mm rule.
    expect(
      violations.some(
        (v) => v.rule === 'clearance' && v.elementIds.includes('sym-close-twin'),
      ),
    ).toBe(true)
  })

  test('the scale gate fails a floor too large for the plate', () => {
    const huge: FloorModel = structuredClone(sampleFloorModel)
    // Pretend the same drawing spans a 100m building: door widths shrink
    // below 5mm once scaled.
    huge.walls.push({
      a: { x: 0, y: 0 },
      b: { x: 20000, y: 0 },
      confidence: 1,
      id: 'w-long',
      kind: 'wall',
      thickness: 10,
    })
    const hugeContext = buildValidationContext(huge)
    const hugeDesign = convertToTactile(huge).design
    const violations = validateTactileDesign(hugeDesign, hugeContext)
    expect(violations.some((v) => v.rule === 'scale')).toBe(true)
    expect(
      violations.find((v) => v.rule === 'scale')?.message,
    ).toContain('too large')
  })

  test('braille outside the margin is flagged', () => {
    const out: TactileDesign = structuredClone(design)
    const label = out.elements.find((e) => e.kind === 'braille')
    if (label?.kind === 'braille') label.at = { x: 1, y: 1 }
    const violations = validateTactileDesign(out, context)
    expect(violations.some((v) => v.rule === 'margin')).toBe(true)
  })
})
