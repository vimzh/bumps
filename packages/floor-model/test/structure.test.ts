import { describe, expect, test } from 'bun:test'
import {
  auditFloorModel,
  FURNITURE_CAP,
  normalizeFloorModel,
  orthogonalizeNearRectangle,
  sampleFloorModel,
} from '../src'
import type { FloorModel, Furniture, Opening, Wall } from '../src'

function wall(id: string, ax: number, ay: number, bx: number, by: number, thickness = 8): Wall {
  return {
    a: { x: ax, y: ay },
    b: { x: bx, y: by },
    confidence: 0.9,
    id,
    kind: 'wall',
    thickness,
  }
}

function door(id: string, x: number, y: number, width = 40, wallId: string | null = null): Opening {
  return { at: { x, y }, confidence: 0.9, id, kind: 'door', wallId, width }
}

function block(id: string, label: string, x0: number, y0: number, x1: number, y1: number): Furniture {
  return {
    confidence: 0.8,
    id,
    kind: 'furniture',
    label,
    polygon: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  }
}

function makeModel(overrides: Partial<FloorModel>): FloorModel {
  return {
    features: [],
    furniture: [],
    openings: [],
    paths: [],
    plan: { heightPx: 800, north: null, pixelsPerMeter: null, widthPx: 1000 },
    roads: [],
    rooms: [],
    schemaVersion: 1,
    title: null,
    walls: [],
    ...overrides,
  }
}

describe('normalizeFloorModel', () => {
  test('welds near-miss L corners and snaps T junctions onto the crossbar', () => {
    const { model, notes } = normalizeFloorModel(
      makeModel({
        walls: [
          // L corner missing its meeting point by 6px.
          wall('w-1', 100, 100, 500, 100),
          wall('w-2', 504, 104, 500, 400),
          // T stem stopping 7px short of the crossbar w-1.
          wall('w-3', 300, 107, 300, 300),
        ],
      }),
    )
    const w1 = model.walls.find((w) => w.id === 'w-1')!
    const w2 = model.walls.find((w) => w.id === 'w-2')!
    const w3 = model.walls.find((w) => w.id === 'w-3')!
    expect(Math.hypot(w1.b.x - w2.a.x, w1.b.y - w2.a.y)).toBeLessThan(0.01)
    // The stem endpoint must land ON the (welded) crossbar segment.
    const t =
      ((w3.a.x - w1.a.x) * (w1.b.x - w1.a.x) + (w3.a.y - w1.a.y) * (w1.b.y - w1.a.y)) /
      ((w1.b.x - w1.a.x) ** 2 + (w1.b.y - w1.a.y) ** 2)
    const onCrossbar = {
      x: w1.a.x + t * (w1.b.x - w1.a.x),
      y: w1.a.y + t * (w1.b.y - w1.a.y),
    }
    expect(Math.hypot(w3.a.x - onCrossbar.x, w3.a.y - onCrossbar.y)).toBeLessThan(0.01)
    expect(notes.join(' ')).toContain('junction')
  })

  test('does not weld across a short curve segment', () => {
    // Three short chained segments approximating a curve: endpoints must
    // stay a chain, not collapse into one point.
    const { model } = normalizeFloorModel(
      makeModel({
        walls: [
          wall('c-1', 100, 100, 130, 108, 4),
          wall('c-2', 130, 108, 158, 124, 4),
          wall('c-3', 158, 124, 180, 148, 4),
        ],
      }),
    )
    const c2 = model.walls.find((w) => w.id === 'c-2')!
    expect(Math.hypot(c2.a.x - c2.b.x, c2.a.y - c2.b.y)).toBeGreaterThan(20)
  })

  test('drops duplicate walls, keeping the higher confidence trace', () => {
    const duplicate = { ...wall('w-dup', 101, 99, 499, 101), confidence: 0.95 }
    const { model, notes } = normalizeFloorModel(
      makeModel({ walls: [wall('w-1', 100, 100, 500, 100), duplicate] }),
    )
    expect(model.walls).toHaveLength(1)
    expect(model.walls[0]!.confidence).toBe(0.95)
    expect(notes.join(' ')).toContain('duplicate wall')
  })

  test('attaches unassigned openings to the nearest wall and snaps them onto it', () => {
    const { model, notes } = normalizeFloorModel(
      makeModel({
        openings: [door('d-1', 300, 106)],
        walls: [wall('w-1', 100, 100, 500, 100)],
      }),
    )
    expect(model.openings[0]!.wallId).toBe('w-1')
    expect(model.openings[0]!.at.y).toBeCloseTo(100, 5)
    expect(notes.join(' ')).toContain('attached 1 opening')
  })

  test('merges double-reported doors on the same wall', () => {
    const { model } = normalizeFloorModel(
      makeModel({
        openings: [door('d-1', 300, 100, 40), door('d-2', 310, 100, 40)],
        walls: [wall('w-1', 100, 100, 500, 100)],
      }),
    )
    expect(model.openings).toHaveLength(1)
  })

  test('clubs overlapping same-label furniture and caps low-significance blocks', () => {
    const clutter = Array.from({ length: FURNITURE_CAP + 4 }, (_, i) =>
      block(`fur-${i}`, 'plant', 10 + i * 45, 700, 30 + i * 45, 720),
    )
    const { model, notes } = normalizeFloorModel(
      makeModel({
        furniture: [
          block('fur-a', 'chairs', 100, 100, 200, 160),
          block('fur-b', 'chairs', 140, 100, 240, 160),
          block('fur-desk', 'reception desk', 400, 400, 600, 460),
          ...clutter,
        ],
      }),
    )
    const chairs = model.furniture.filter((f) => f.label === 'chairs')
    expect(chairs).toHaveLength(1)
    expect(model.furniture.length).toBeLessThanOrEqual(FURNITURE_CAP)
    // The landmark survives the cap even though clutter is larger in count.
    expect(model.furniture.some((f) => f.label === 'reception desk')).toBe(true)
    expect(notes.join(' ')).toContain('low-significance furniture')
  })

  test('straightens slightly skewed rectangles without changing deliberate polygons', () => {
    const desk = block('fur-desk', 'desk', 100, 100, 300, 220)
    desk.polygon[2] = { x: 295, y: 224 }
    const hexagon = Array.from({ length: 6 }, (_, index) => {
      const angle = (index / 6) * Math.PI * 2
      return { x: 500 + Math.cos(angle) * 80, y: 400 + Math.sin(angle) * 80 }
    })
    const { model, notes } = normalizeFloorModel(
      makeModel({
        furniture: [
          desk,
          { ...block('fur-fountain', 'fountain', 0, 0, 1, 1), polygon: hexagon },
        ],
      }),
    )

    expect(model.furniture.find((item) => item.id === 'fur-desk')!.polygon).toEqual([
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 224 },
      { x: 100, y: 224 },
    ])
    expect(orthogonalizeNearRectangle(hexagon)).toBe(hexagon)
    expect(notes.join(' ')).toContain('straightened 1')
  })

  test('keeps a clean model untouched', () => {
    const { model, notes } = normalizeFloorModel(sampleFloorModel)
    expect(model.walls).toHaveLength(sampleFloorModel.walls.length)
    expect(model.openings).toHaveLength(sampleFloorModel.openings.length)
    expect(notes).toHaveLength(0)
  })
})

describe('auditFloorModel', () => {
  test('reports a doorway-width gap between aligned walls as a candidate', () => {
    const model = makeModel({
      // Aligned horizontal walls with a 42px gap; three existing openings
      // calibrate the plausible door width.
      openings: [
        door('d-1', 150, 100, 40, 'w-1'),
        door('d-2', 800, 100, 40, 'w-2'),
        door('d-3', 850, 100, 40, 'w-2'),
      ],
      walls: [wall('w-1', 100, 100, 400, 100), wall('w-2', 442, 100, 900, 100)],
    })
    const findings = auditFloorModel(model)
    const gap = findings.find((f) => f.kind === 'gap-candidate')
    expect(gap).toBeDefined()
    expect(gap!.message).toContain('w-1')
    expect(gap!.message).toContain('w-2')
    expect(Math.round(gap!.at.x)).toBe(421)
  })

  test('does not report a gap already covered by an opening or a junction', () => {
    const covered = makeModel({
      openings: [
        door('d-1', 421, 100, 44, 'w-1'),
        door('d-2', 800, 100, 40, 'w-2'),
        door('d-3', 850, 100, 40, 'w-2'),
      ],
      walls: [wall('w-1', 100, 100, 400, 100), wall('w-2', 442, 100, 900, 100)],
    })
    expect(auditFloorModel(covered).filter((f) => f.kind === 'gap-candidate')).toHaveLength(0)

    const junction = makeModel({
      openings: [
        door('d-1', 150, 100, 40, 'w-1'),
        door('d-2', 800, 100, 40, 'w-2'),
        door('d-3', 850, 100, 40, 'w-2'),
      ],
      walls: [
        wall('w-1', 100, 100, 400, 100),
        wall('w-2', 442, 100, 900, 100),
        // A crossing wall through the gap: junction, not doorway.
        wall('w-3', 421, 60, 421, 400),
      ],
    })
    expect(auditFloorModel(junction).filter((f) => f.kind === 'gap-candidate')).toHaveLength(0)
  })

  test('reports sealed walled rooms but not campus block plans', () => {
    const sealed = makeModel({
      rooms: [
        {
          confidence: 0.9,
          id: 'r-1',
          kind: 'room',
          label: 'Store',
          polygon: [
            { x: 100, y: 100 },
            { x: 300, y: 100 },
            { x: 300, y: 300 },
            { x: 100, y: 300 },
          ],
        },
      ],
      walls: [
        wall('w-1', 100, 100, 300, 100),
        wall('w-2', 300, 100, 300, 300),
        wall('w-3', 300, 300, 100, 300),
        wall('w-4', 100, 300, 100, 100),
      ],
    })
    expect(auditFloorModel(sealed).some((f) => f.kind === 'sealed-room')).toBe(true)

    const campus = makeModel({
      rooms: Array.from({ length: 10 }, (_, i) => ({
        confidence: 0.9,
        id: `b-${i}`,
        kind: 'room' as const,
        label: `Building ${i}`,
        polygon: [
          { x: 50 + i * 90, y: 50 },
          { x: 120 + i * 90, y: 50 },
          { x: 120 + i * 90, y: 120 },
          { x: 50 + i * 90, y: 120 },
        ],
      })),
    })
    expect(auditFloorModel(campus).some((f) => f.kind === 'sealed-room')).toBe(false)
  })

  test('flags perimeter entrances that have no gate opening', () => {
    const model = makeModel({
      features: [
        { at: { x: 100, y: 300 }, confidence: 0.9, id: 'f-1', kind: 'entrance', rotation: 90 },
      ],
      openings: [door('d-1', 500, 100, 40, 'w-1')],
      walls: [wall('w-1', 100, 100, 900, 100), wall('w-2', 100, 100, 100, 700)],
    })
    const findings = auditFloorModel(model)
    expect(findings.some((f) => f.kind === 'entrance-without-gate')).toBe(true)

    const gated = makeModel({
      ...model,
      openings: [...model.openings, door('d-2', 100, 330, 50, 'w-2')],
    })
    expect(
      auditFloorModel(gated).some((f) => f.kind === 'entrance-without-gate'),
    ).toBe(false)
  })

  test('flags door pairs close enough to be one drawn opening', () => {
    const model = makeModel({
      openings: [
        door('d-1', 400, 300, 70, 'w-1'),
        door('d-2', 405, 395, 80, 'w-2'),
      ],
      walls: [wall('w-1', 100, 300, 900, 300), wall('w-2', 100, 395, 900, 395)],
    })
    const findings = auditFloorModel(model)
    expect(findings.some((f) => f.kind === 'door-pair')).toBe(true)
  })

  test('flags clusters of short parallel walls as likely stair treads', () => {
    const treads = Array.from({ length: 6 }, (_, i) =>
      wall(`t-${i}`, 300, 400 + i * 14, 345, 400 + i * 14, 3),
    )
    const model = makeModel({
      walls: [wall('w-long', 100, 100, 900, 100), ...treads],
    })
    const findings = auditFloorModel(model)
    const tread = findings.find((f) => f.kind === 'stair-treads')
    expect(tread).toBeDefined()
    expect(tread!.message).toContain('t-0')
  })

  test('reports openings that lie on no wall', () => {
    const model = makeModel({
      openings: [door('d-1', 700, 500)],
      walls: [wall('w-1', 100, 100, 500, 100)],
    })
    const findings = auditFloorModel(model)
    expect(findings.some((f) => f.kind === 'orphan-opening')).toBe(true)
  })

  test('finds nothing to flag on the clean sample model', () => {
    const { model } = normalizeFloorModel(sampleFloorModel)
    expect(auditFloorModel(model)).toHaveLength(0)
  })
})
