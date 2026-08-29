import { describe, expect, test } from 'bun:test'
import {
  assignKeys,
  BRAILLE_MM,
  convertToTactile,
  planToPlateTransform,
  PLATE,
  sampleFloorModel,
  tactileDesignSchema,
  textBrailleSize,
  textDotCenters,
  textToBrailleCells,
} from '../src'

describe('braille', () => {
  test('letters, digits, and spaces translate to Grade 1 cells', () => {
    expect(textToBrailleCells('ab')).toEqual([[1], [1, 2]])
    // Digits get one number sign per run: "r2" = r, #, b
    expect(textToBrailleCells('r2')).toEqual([
      [1, 2, 3, 5],
      [3, 4, 5, 6],
      [1, 2],
    ])
    expect(textToBrailleCells('a b')).toEqual([[1], [], [1, 2]])
  })

  test('dot geometry follows ADA spacing', () => {
    const dots = textDotCenters('c', { x: 0, y: 0 })
    // c = dots 1,4: two dots one column apart
    expect(dots).toEqual([
      { x: 0, y: 0 },
      { x: BRAILLE_MM.dotPitchX, y: 0 },
    ])
    const two = textDotCenters('aa', { x: 0, y: 0 })
    expect(two[1]!.x).toBe(BRAILLE_MM.cellPitch)
    expect(textBrailleSize('ab').widthMm).toBeCloseTo(
      BRAILLE_MM.cellPitch + BRAILLE_MM.dotPitchX + BRAILLE_MM.dotDiameter,
    )
  })
})

describe('key assignment', () => {
  test('keys are unique 1-2 letter codes', () => {
    const keys = assignKeys(['Studio', 'Stairs', 'Storage', 'Corridor'])
    const values = [...keys.values()]
    expect(new Set(values).size).toBe(4)
    for (const value of values) {
      expect(value.length).toBeLessThanOrEqual(2)
      expect(value.length).toBeGreaterThan(0)
    }
    expect(keys.get('Corridor')).toBe('co')
  })
})

describe('convertToTactile', () => {
  const { design, notes } = convertToTactile(sampleFloorModel)

  test('produces a schema-valid design that fits the plate', () => {
    tactileDesignSchema.parse(design)
    expect(design.plate.widthMm).toBe(PLATE.widthMm)
    for (const element of design.elements) {
      const points =
        element.kind === 'line'
          ? element.points
          : element.kind === 'area'
            ? element.polygon
            : [element.at]
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0)
        expect(p.x).toBeLessThanOrEqual(PLATE.widthMm)
        expect(p.y).toBeGreaterThanOrEqual(0)
        expect(p.y).toBeLessThanOrEqual(PLATE.heightMm)
      }
    }
  })

  test('walls become 2mm/1mm lines split at doorways; windows drop with a note', () => {
    const lines = design.elements.filter((e) => e.kind === 'line')
    // 8 walls; two corridor walls carry 2 doors each (3 segments), the
    // bottom wall 1 door (2 segments): 5 + 3 + 3 + 2 = 13 segments.
    expect(lines).toHaveLength(13)
    for (const line of lines) {
      expect(line.widthMm).toBe(2)
      expect(line.heightMm).toBe(1)
    }
    expect(notes.some((n) => n.kind === 'dropped-window')).toBe(true)
    const symbols = design.elements.filter((e) => e.kind === 'symbol')
    // Features only — doors are gaps now, never symbols.
    expect(symbols).toHaveLength(4)
    expect(symbols.every((s) => s.symbol !== 'door')).toBe(true)
    expect(symbols.every((s) => s.heightMm === 1.5)).toBe(true)
  })

  test('labels become unique braille keys with legend entries', () => {
    const braille = design.elements.filter((e) => e.kind === 'braille')
    // 5 labeled rooms + 2 furniture blocks; no you-are-here marker
    expect(braille).toHaveLength(7)
    const keys = design.legend.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(design.separateLegendPlate).toBe(design.legend.length > 4)
  })

  test('furniture becomes low-relief labeled blocks', () => {
    const areas = design.elements.filter((e) => e.kind === 'area')
    expect(areas).toHaveLength(2)
    for (const area of areas) {
      expect(area.heightMm).toBe(0.5)
      expect(area.texture).toBe('solid')
    }
    const texts = design.legend.map((entry) => entry.text)
    expect(texts).toContain('chairs')
    expect(texts).toContain('sofa')
    // Keys sit on their blocks
    const chairKey = design.elements.find((e) => e.id === 't-label-fur-chairs')
    expect(chairKey?.kind).toBe('braille')
  })

  test('doorways leave fingertip-findable gaps in their wall', () => {
    // d-nw sits at x=250 on the corridor's north wall (y=380). No wall
    // segment from that wall may cover the door's position.
    const { mmPerPx, toMm } = planToPlateTransform(sampleFloorModel)
    const doorAt = toMm({ x: 250, y: 380 })
    const segments = design.elements.filter(
      (e) => e.kind === 'line' && e.sourceId === 'w-corridor-n',
    )
    expect(segments.length).toBe(3)
    for (const segment of segments) {
      if (segment.kind !== 'line') continue
      const xs = segment.points.map((p) => p.x)
      const covers =
        Math.min(...xs) <= doorAt.x && doorAt.x <= Math.max(...xs)
      expect(covers).toBe(false)
    }
    // The gap is at least the printed door width (>= the 6mm minimum).
    expect(45 * mmPerPx).toBeGreaterThan(0)
  })

  test('you-are-here marker gets a braille key and legend text', () => {
    const withMarker = structuredClone(sampleFloorModel)
    withMarker.features.push({
      at: { x: 500, y: 700 },
      confidence: 1,
      id: 'f-yah',
      kind: 'you-are-here',
      rotation: 0,
    })
    const result = convertToTactile(withMarker)
    expect(
      result.design.legend.some((entry) => entry.text === 'you are here'),
    ).toBe(true)
    expect(
      result.design.elements.some((e) => e.id === 't-label-f-yah'),
    ).toBe(true)
  })
})
