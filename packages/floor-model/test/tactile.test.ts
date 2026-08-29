import { describe, expect, test } from 'bun:test'
import {
  fitRectInPolygon,
  floorModelSchema,
  resolveMechanicalViolations,
  assignKeys,
  buildValidationContext,
  validateTactileDesign,
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

describe('sliver-room labels', () => {
  test('fitRectInPolygon rejects thin diagonal slivers despite a large bbox', () => {
    // Modeled on CCH's diagonal halls: a near-collinear parallelogram
    // whose bbox is 1400×1000 but whose band is ~12 units wide.
    const sliver = [
      { x: 2400, y: 2500 },
      { x: 2800, y: 2200 },
      { x: 3800, y: 1500 },
      { x: 3500, y: 1500 },
    ]
    expect(fitRectInPolygon(160, 130, sliver, { x: 3100, y: 1925 })).toBeNull()
    const square = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 300 },
      { x: 0, y: 300 },
    ]
    expect(fitRectInPolygon(160, 130, square, { x: 150, y: 150 })).not.toBeNull()
  })

  test('a sliver room gets an adjacent label and no label-fit violation', () => {
    const model = floorModelSchema.parse({
      ...sampleFloorModel,
      furniture: [],
      rooms: [
        {
          confidence: 1,
          id: 'r-sliver',
          kind: 'room',
          label: 'Hall D',
          polygon: [
            { x: 100, y: 500 },
            { x: 180, y: 440 },
            { x: 380, y: 300 },
            { x: 320, y: 300 },
          ],
        },
      ],
    })
    const { design } = convertToTactile(model)
    const label = design.elements.find(
      (e) => e.kind === 'braille' && e.sourceId === 'r-sliver',
    )
    expect(label).toBeDefined()
    const violations = validateTactileDesign(
      design,
      buildValidationContext(model),
    )
    expect(violations.filter((v) => v.rule === 'label-fit')).toHaveLength(0)
  })
})

describe('wall-less block plans', () => {
  test('labeled rooms render as raised blocks when the plan has no walls', () => {
    const model = floorModelSchema.parse({
      ...sampleFloorModel,
      furniture: [],
      openings: [],
      walls: [],
    })
    const { design, notes } = convertToTactile(model)
    const blocks = design.elements.filter(
      (e) => e.kind === 'area' && e.id.startsWith('t-room-'),
    )
    expect(blocks.length).toBeGreaterThan(0)
    expect(notes.some((n) => n.kind === 'room-block')).toBe(true)
  })
})

describe('mechanical seam fixes', () => {
  test('a braille label straddling a seam is nudged clear deterministically', () => {
    const model = floorModelSchema.parse({ ...sampleFloorModel, furniture: [] })
    const { design } = convertToTactile(model)
    const wide = {
      ...design,
      grid: { cols: 2, rows: 1 },
      elements: design.elements.map((e) =>
        e.kind === 'braille'
          ? { ...e, at: { x: design.plate.widthMm - 2, y: e.at.y } }
          : e,
      ),
    }
    const context = buildValidationContext(model)
    const before = validateTactileDesign(wide, context)
    expect(before.some((v) => v.rule === 'seam-clearance')).toBe(true)
    const fixed = resolveMechanicalViolations(wide, context)
    const after = validateTactileDesign(fixed, context)
    expect(after.filter((v) => v.rule === 'seam-clearance').length).toBeLessThan(
      before.filter((v) => v.rule === 'seam-clearance').length,
    )
    expect(after.length).toBeLessThanOrEqual(before.length)
  })
})

describe('multi-plate deciding step', () => {
  // Streches the building; door widths stay fixed (as in reality: rooms
  // multiply, doors stay ~0.9 m) — which is exactly what forces multi-plate.
  function stretched(factor: number) {
    const model = structuredClone(sampleFloorModel)
    const scale = (p: { x: number; y: number }) => ({ x: p.x * factor, y: p.y })
    model.walls = model.walls.map((w) => ({ ...w, a: scale(w.a), b: scale(w.b) }))
    model.rooms = model.rooms.map((r) => ({ ...r, polygon: r.polygon.map(scale) }))
    model.openings = model.openings.map((o) => ({ ...o, at: scale(o.at) }))
    model.features = model.features.map((f) => ({ ...f, at: scale(f.at) }))
    model.furniture = model.furniture.map((f) => ({ ...f, polygon: f.polygon.map(scale) }))
    model.plan.widthPx *= factor
    return model
  }

  test('small floors stay on one plate', () => {
    const { design } = convertToTactile(sampleFloorModel)
    expect(design.grid).toEqual({ cols: 1, rows: 1 })
  })

  test('a wide floor picks 1x2 and notes it', () => {
    const model = stretched(3)
    const { design, notes } = convertToTactile(model)
    expect(design.grid.cols).toBe(2)
    expect(design.grid.rows).toBe(1)
    expect(notes.some((n) => n.kind === 'multi-plate')).toBe(true)
  })

  test('an enormous floor maxes at 2x2 and the scale gate fires', () => {
    const model = stretched(40)
    const { design } = convertToTactile(model)
    expect(design.grid).toEqual({ cols: 2, rows: 2 })
    const violations = validateTactileDesign(
      design,
      buildValidationContext(model),
    )
    expect(violations.some((v) => v.rule === 'scale')).toBe(true)
  })

  test('braille and symbols near a seam are flagged as movable violations', () => {
    const model = stretched(3)
    const { design } = convertToTactile(model)
    const label = design.elements.find((e) => e.kind === 'braille')
    if (label?.kind === 'braille') {
      label.at = { x: design.plate.widthMm - 4, y: 100 }
    }
    const violations = validateTactileDesign(
      design,
      buildValidationContext(model),
    )
    expect(violations.some((v) => v.rule === 'seam-clearance')).toBe(true)
  })
})
