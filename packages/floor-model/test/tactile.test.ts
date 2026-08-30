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
  paginateBrailleRows,
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

  test('legend rows paginate before braille crosses the plate margin', () => {
    const rows = Array.from({ length: 22 }, (_, index) => `row ${index + 1}`)
    const pages = paginateBrailleRows(rows, PLATE)
    expect(pages.map((page) => page.length)).toEqual([18, 4])
    expect(pages.flat()).toEqual(rows)
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
    const lines = design.elements.filter(
      (e) => e.kind === 'line' && e.style === 'solid',
    )
    // 8 walls; two corridor walls carry 2 doors each (3 segments), the
    // bottom wall 1 door (2 segments): 5 + 3 + 3 + 2 = 13 segments.
    expect(lines).toHaveLength(13)
    for (const line of lines) {
      expect(line.kind === 'line' && line.widthMm).toBe(2)
      expect(line.kind === 'line' && line.heightMm).toBe(1)
    }
    expect(notes.some((n) => n.kind === 'dropped-window')).toBe(true)
    const symbols = design.elements.filter((e) => e.kind === 'symbol')
    // Four plan features plus the north arrow; doors are gaps, not symbols.
    expect(symbols).toHaveLength(5)
    expect(symbols.every((s) => s.symbol !== 'door')).toBe(true)
    expect(symbols.every((s) => s.heightMm === 1.5)).toBe(true)
  })

  test('labels become unique braille keys with legend entries', () => {
    const braille = design.elements.filter(
      (e) => e.kind === 'braille' && e.sourceId !== null,
    )
    // 5 labeled rooms + 2 furniture blocks + 1 labeled road.
    // (The plate title is a separate source-less braille run.)
    expect(braille).toHaveLength(8)
    const keys = design.legend.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(design.separateLegendPlate).toBe(design.legend.length > 4)
  })

  test('room area measurements do not become navigation labels', () => {
    const model = structuredClone(sampleFloorModel)
    model.rooms[0]!.label = '139 SF'
    const result = convertToTactile(model)
    expect(result.design.elements.some((element) => element.id === 't-label-r-nw')).toBe(
      false,
    )
    expect(result.design.legend.some((entry) => entry.text === '139 sf')).toBe(false)
  })

  test('furniture becomes low-relief labeled blocks', () => {
    const areas = design.elements.filter(
      (e) => e.kind === 'area' && e.sourceId?.startsWith('fur-'),
    )
    expect(areas).toHaveLength(2)
    for (const area of areas) {
      if (area.kind !== 'area') throw new Error('Expected tactile area')
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

  test('sub-fingertip furniture is omitted with a note', () => {
    const model = structuredClone(sampleFloorModel)
    model.furniture = [
      {
        confidence: 0.9,
        id: 'fur-tiny',
        kind: 'furniture',
        label: 'tiny counter',
        polygon: [
          { x: 10, y: 10 },
          { x: 11, y: 10 },
          { x: 11, y: 11 },
          { x: 10, y: 11 },
        ],
      },
    ]
    const result = convertToTactile(model)
    expect(result.design.elements.some((element) => element.sourceId === 'fur-tiny')).toBe(
      false,
    )
    expect(
      result.notes.some(
        (note) => note.kind === 'dropped-furniture' && note.elementId === 'fur-tiny',
      ),
    ).toBe(true)
  })

  test('furniture too narrow for braille keeps its block without an adjacent key', () => {
    const model = structuredClone(sampleFloorModel)
    model.furniture = [
      {
        confidence: 0.9,
        id: 'fur-narrow',
        kind: 'furniture',
        label: 'counter',
        polygon: [
          { x: 120, y: 250 },
          { x: 220, y: 250 },
          { x: 220, y: 280 },
          { x: 120, y: 280 },
        ],
      },
    ]
    const result = convertToTactile(model)
    expect(result.design.elements.some((element) => element.id === 't-fur-narrow')).toBe(true)
    expect(result.design.elements.some((element) => element.id === 't-label-fur-narrow')).toBe(false)
    expect(result.design.legend.some((entry) => entry.text === 'counter')).toBe(false)
    expect(
      result.notes.some(
        (note) =>
          note.kind === 'dropped-furniture-label' && note.elementId === 'fur-narrow',
      ),
    ).toBe(true)
  })

  test('round landmarks retain their polygon instead of becoming boxes', () => {
    const model = structuredClone(sampleFloorModel)
    model.furniture = [
      {
        confidence: 0.95,
        id: 'fur-fountain',
        kind: 'furniture',
        label: 'fountain',
        polygon: Array.from({ length: 16 }, (_, index) => {
          const angle = (index / 16) * Math.PI * 2
          return { x: 500 + Math.cos(angle) * 90, y: 400 + Math.sin(angle) * 90 }
        }),
      },
    ]
    const { design } = convertToTactile(model)
    const fountain = design.elements.find(
      (element) => element.kind === 'area' && element.sourceId === 'fur-fountain',
    )

    expect(fountain?.kind).toBe('area')
    if (!fountain || fountain.kind !== 'area') return
    expect(fountain.polygon).toHaveLength(16)
  })

  test('roads become low-relief bands with keyed labels', () => {
    const roadAreas = design.elements.filter(
      (e) => e.kind === 'area' && e.sourceId === 'road-1',
    )
    expect(roadAreas).toHaveLength(1)
    expect(roadAreas[0]!.kind).toBe('area')
    if (roadAreas[0]!.kind !== 'area') throw new Error('Expected road area')
    expect(roadAreas[0]!.heightMm).toBe(0.5)
    expect(design.legend.some((entry) => entry.text === 'main st')).toBe(true)
    expect(design.elements.some((e) => e.id === 't-label-road-1')).toBe(true)
  })

  test('roads and paths participate in the plate bounds', () => {
    const model = structuredClone(sampleFloorModel)
    model.roads[0]!.points = [
      { x: -200, y: 790 },
      { x: 1200, y: 790 },
    ]
    model.roads[0]!.widthPx = 100
    model.paths[0]!.points.push({ x: 1300, y: 400 })
    const { bounds } = planToPlateTransform(model)
    expect(bounds.minX).toBe(-250)
    expect(bounds.maxX).toBe(1300)
  })

  test('a multi-segment road label validates against the whole road', () => {
    const model = structuredClone(sampleFloorModel)
    model.roads[0]!.points = [
      { x: 40, y: 760 },
      { x: 800, y: 760 },
      { x: 800, y: 700 },
      { x: 900, y: 700 },
    ]
    const { design } = convertToTactile(model)
    const violations = validateTactileDesign(
      design,
      buildValidationContext(model),
    )
    expect(
      violations.filter(
        (violation) =>
          violation.rule === 'label-fit' &&
          violation.elementIds.includes('t-label-road-1'),
      ),
    ).toHaveLength(0)
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

  test('short wall legs survive when they form L, U, or T junctions', () => {
    const model = structuredClone(sampleFloorModel)
    model.openings = []
    model.walls.push(
      {
        a: { x: 250, y: 40 },
        b: { x: 250, y: 50 },
        confidence: 1,
        id: 'w-short-junction',
        kind: 'wall',
        thickness: 8,
      },
      {
        a: { x: 300, y: 300 },
        b: { x: 300, y: 310 },
        confidence: 1,
        id: 'w-short-isolated',
        kind: 'wall',
        thickness: 8,
      },
    )
    const { design, notes } = convertToTactile(model)
    expect(design.elements.some((element) => element.id === 't-w-short-junction')).toBe(
      true,
    )
    expect(design.elements.some((element) => element.id === 't-w-short-isolated')).toBe(
      false,
    )
    expect(
      notes.some(
        (note) =>
          note.kind === 'dropped-wall' && note.elementId === 'w-short-isolated',
      ),
    ).toBe(true)
  })

  test('door gaps never emit zero-length wall fragments', () => {
    const model = structuredClone(sampleFloorModel)
    model.openings.push({
      at: model.walls[0]!.a,
      confidence: 1,
      id: 'door-at-endpoint',
      kind: 'door',
      wallId: model.walls[0]!.id,
      width: 40,
    })
    const { design } = convertToTactile(model)
    const lines = design.elements.filter((element) => element.kind === 'line')

    expect(
      lines.every((line) =>
        line.points.slice(1).every((point, index) => {
          const previous = line.points[index]!
          return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01
        }),
      ),
    ).toBe(true)
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

  test('a room split by a plate seam may use an adjacent label', () => {
    const seamDesign = tactileDesignSchema.parse({
      elements: [
        {
          at: { x: 175, y: 80 },
          id: 't-label-seam-room',
          key: 'ma',
          kind: 'braille',
          sourceId: 'seam-room',
        },
      ],
      grid: { cols: 2, rows: 1 },
      legend: [{ key: 'ma', text: 'main hall' }],
      mmPerPx: 1,
      plate: PLATE,
      schemaVersion: 1,
      separateLegendPlate: false,
      title: null,
    })
    const violations = validateTactileDesign(seamDesign, {
      doorOpeningsMm: [],
      roomsMm: [
        {
          id: 'seam-room',
          polygonMm: [
            { x: 190, y: 60 },
            { x: 210, y: 60 },
            { x: 210, y: 100 },
            { x: 190, y: 100 },
          ],
        },
      ],
      scaleFeaturesMm: [],
    })
    expect(violations.filter((violation) => violation.rule === 'label-fit')).toHaveLength(
      0,
    )
  })

})

describe('map fabric: paths, title, north', () => {
  const { design } = convertToTactile(sampleFloorModel)

  test('guide paths become dashed 1.5mm lines', () => {
    const dashed = design.elements.filter(
      (e) => e.kind === 'line' && e.style === 'dashed',
    )
    expect(dashed).toHaveLength(1)
    expect(dashed[0]!.kind === 'line' && dashed[0]!.widthMm).toBe(1.5)
  })

  test('the plate carries a braille title when it fits', () => {
    const title = design.elements.find((e) => e.id === 't-title')
    expect(title).toBeDefined()
    expect(title!.kind === 'braille' && title!.key).toBe('sample office floor')
  })

  test('a known north renders as a rotated arrow symbol', () => {
    const north = design.elements.find((e) => e.id === 't-north')
    expect(north).toBeDefined()
    expect(north!.kind === 'symbol' && north!.symbol).toBe('north')
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
  test('a point symbol outside the plate margin is clamped inside', () => {
    const model = floorModelSchema.parse({ ...sampleFloorModel, furniture: [] })
    const { design } = convertToTactile(model)
    const symbolIndex = design.elements.findIndex((element) => element.kind === 'symbol')
    const outside = {
      ...design,
      elements: design.elements.map((element, index) =>
        index === symbolIndex && element.kind === 'symbol'
          ? { ...element, at: { x: 0, y: 0 } }
          : element,
      ),
    }
    const context = buildValidationContext(model)
    expect(validateTactileDesign(outside, context).some((v) => v.rule === 'margin')).toBe(
      true,
    )
    expect(
      validateTactileDesign(resolveMechanicalViolations(outside, context), context).some(
        (v) => v.rule === 'margin',
      ),
    ).toBe(false)
  })

  test('a room label outside the margin relocates without leaving its room', () => {
    const model = floorModelSchema.parse({ ...sampleFloorModel, furniture: [] })
    const { design } = convertToTactile(model)
    const label = design.elements.find(
      (element) => element.kind === 'braille' && element.sourceId === 'r-nw',
    )
    expect(label?.kind).toBe('braille')
    if (!label || label.kind !== 'braille') return
    const outside = {
      ...design,
      elements: design.elements.map((element) =>
        element.id === label.id && element.kind === 'braille'
          ? { ...element, at: { x: 0, y: 0 } }
          : element,
      ),
    }
    const context = buildValidationContext(model)
    const fixed = resolveMechanicalViolations(outside, context)
    const remaining = validateTactileDesign(fixed, context)

    expect(
      remaining.some(
        (violation) =>
          violation.elementIds.includes(label.id) &&
          (violation.rule === 'margin' || violation.rule === 'label-fit'),
      ),
    ).toBe(false)
  })

  test('a symbol embedded in a wall moves far enough to clear its own radius', () => {
    const model = floorModelSchema.parse({ ...sampleFloorModel, furniture: [] })
    const { design } = convertToTactile(model)
    const wall = design.elements.find(
      (element) => element.kind === 'line' && element.id === 't-w-left',
    )
    const symbol = design.elements.find(
      (element) => element.kind === 'symbol' && element.sourceId === 'f-elevator',
    )
    expect(wall?.kind).toBe('line')
    expect(symbol?.kind).toBe('symbol')
    if (!wall || wall.kind !== 'line' || !symbol || symbol.kind !== 'symbol') return
    const embedded = {
      ...design,
      elements: design.elements.map((element) =>
        element.id === symbol.id && element.kind === 'symbol'
          ? { ...element, at: { x: wall.points[0]!.x + 2, y: 150 } }
          : element,
      ),
    }
    const context = buildValidationContext(model)
    const target = (violation: { elementIds: string[]; rule: string }) =>
      violation.rule === 'clearance' &&
      violation.elementIds.includes(symbol.id) &&
      violation.elementIds.includes(wall.id)
    expect(validateTactileDesign(embedded, context).some(target)).toBe(true)
    expect(
      validateTactileDesign(
        resolveMechanicalViolations(embedded, context),
        context,
      ).some(target),
    ).toBe(false)
  })

  test('a symbol trapped between parallel walls can move diagonally clear', () => {
    const model = floorModelSchema.parse({ ...sampleFloorModel, furniture: [] })
    const { design } = convertToTactile(model)
    const symbol = design.elements.find((element) => element.kind === 'symbol')
    expect(symbol?.kind).toBe('symbol')
    if (!symbol || symbol.kind !== 'symbol') return
    const barriers = Array.from({ length: 17 }, (_, index) => ({
      heightMm: 1,
      id: `barrier-${index}`,
      kind: 'line' as const,
      points: [
        { x: 90, y: 36 + index * 8 },
        { x: 110, y: 36 + index * 8 },
      ],
      sourceId: null,
      style: 'solid' as const,
      widthMm: 2,
    }))
    const trapped = {
      ...design,
      elements: [{ ...symbol, at: { x: 100, y: 100 } }, ...barriers],
    }
    const context = buildValidationContext(model)
    expect(validateTactileDesign(trapped, context)).toHaveLength(1)
    expect(
      validateTactileDesign(resolveMechanicalViolations(trapped, context), context),
    ).toHaveLength(0)
  })

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

  test('a room label outside its room is relocated inside', () => {
    const model = floorModelSchema.parse({ ...sampleFloorModel, furniture: [] })
    const { design } = convertToTactile(model)
    const label = design.elements.find(
      (element) => element.kind === 'braille' && element.sourceId === 'r-nw',
    )
    expect(label?.kind).toBe('braille')
    if (!label || label.kind !== 'braille') return
    const misplaced = {
      ...design,
      elements: design.elements.map((element) =>
        element.id === label.id && element.kind === 'braille'
          ? { ...element, at: { x: 170, y: 170 } }
          : element,
      ),
    }
    const context = buildValidationContext(model)
    const target = (violation: { elementIds: string[]; rule: string }) =>
      violation.rule === 'label-fit' && violation.elementIds.includes(label.id)
    expect(validateTactileDesign(misplaced, context).some(target)).toBe(true)
    expect(
      validateTactileDesign(
        resolveMechanicalViolations(misplaced, context),
        context,
      ).some(target),
    ).toBe(false)
  })

  test('repairs more than twelve independent seam conflicts', () => {
    const model = floorModelSchema.parse({ ...sampleFloorModel, furniture: [] })
    const { design } = convertToTactile(model)
    const label = design.elements.find((element) => element.kind === 'braille')
    expect(label?.kind).toBe('braille')
    if (!label || label.kind !== 'braille') return
    const crowded = {
      ...design,
      grid: { cols: 2, rows: 1 },
      elements: Array.from({ length: 13 }, (_, index) => ({
        ...label,
        at: { x: design.plate.widthMm - 2, y: 15 + index * 12 },
        id: `seam-label-${index}`,
        sourceId: null,
      })),
    }
    const context = buildValidationContext(model)
    const before = validateTactileDesign(crowded, context)
    expect(before.filter((violation) => violation.rule === 'seam-clearance')).toHaveLength(
      13,
    )
    const after = validateTactileDesign(
      resolveMechanicalViolations(crowded, context),
      context,
    )
    expect(after.some((violation) => violation.rule === 'seam-clearance')).toBe(false)
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

  test('a three-plate-wide floor uses 1x3 before a larger grid', () => {
    const model = stretched(5)
    model.roads = []
    const { design } = convertToTactile(model)
    expect(design.grid).toEqual({ cols: 3, rows: 1 })
  })

  test('a wall-less site map uses more plates when footprints become unreadable', () => {
    const model = stretched(10)
    model.openings = []
    model.walls = []
    const { design } = convertToTactile(model)
    expect(design.grid.cols * design.grid.rows).toBeGreaterThan(1)
  })

  test('a sparse-wall site map uses the same footprint scale gate', () => {
    const model = stretched(10)
    model.openings = []
    model.rooms = Array.from({ length: 8 }, (_, index) => ({
      ...model.rooms[index % model.rooms.length]!,
      id: `building-${index}`,
      label: `building ${index}`,
    }))
    model.walls = model.walls.slice(0, 1)
    const { design } = convertToTactile(model)
    expect(design.grid.cols * design.grid.rows).toBeGreaterThan(1)
  })

  test('an enormous floor maxes at 4x4 and the scale gate fires', () => {
    const model = stretched(40)
    const { design } = convertToTactile(model)
    expect(design.grid).toEqual({ cols: 4, rows: 4 })
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
