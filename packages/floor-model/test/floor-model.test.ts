import { describe, expect, test } from 'bun:test'
import {
  applyOperations,
  EditOperationError,
  applyOperation,
  editOperationSchema,
  findElement,
  floorModelSchema,
  renderFloorModelSvg,
  sampleFloorModel,
} from '../src'

describe('schema', () => {
  test('fixture validates and round-trips through JSON', () => {
    const parsed = floorModelSchema.parse(
      JSON.parse(JSON.stringify(sampleFloorModel)),
    )
    expect(parsed.rooms).toHaveLength(5)
    expect(parsed.walls).toHaveLength(8)
    expect(parsed.openings).toHaveLength(6)
    expect(parsed.features).toHaveLength(4)
  })

  test('rejects out-of-range confidence and degenerate polygons', () => {
    const broken = structuredClone(sampleFloorModel) as Record<string, unknown>
    ;(broken.rooms as { confidence: number }[])[0]!.confidence = 1.4
    expect(floorModelSchema.safeParse(broken).success).toBe(false)

    const twoPoints = structuredClone(sampleFloorModel)
    twoPoints.rooms[0]!.polygon = twoPoints.rooms[0]!.polygon.slice(0, 2)
    expect(floorModelSchema.safeParse(twoPoints).success).toBe(false)
  })
})

describe('edit operations', () => {
  test('move, relabel, confirm, delete', () => {
    const result = applyOperations(sampleFloorModel, [
      { op: 'move', id: 'f-elevator', dx: 20, dy: -10 },
      { op: 'relabel', id: 'r-sw', label: 'Print room' },
      { op: 'confirm', id: 'r-sw' },
      { op: 'delete', id: 'win-n' },
    ])
    const elevator = findElement(result, 'f-elevator')
    expect(elevator && 'at' in elevator ? elevator.at : null).toEqual({
      x: 110,
      y: 420,
    })
    const room = result.rooms.find((r) => r.id === 'r-sw')
    expect(room?.label).toBe('Print room')
    expect(room?.confidence).toBe(1)
    expect(findElement(result, 'win-n')).toBeUndefined()
    // Source model untouched
    expect(sampleFloorModel.openings).toHaveLength(6)
  })

  test('merge replaces two rooms with one hull', () => {
    const result = applyOperation(sampleFloorModel, {
      op: 'merge',
      ids: ['r-sw', 'r-se'],
      label: 'Open floor',
    })
    expect(result.rooms).toHaveLength(4)
    const merged = result.rooms.find((r) => r.label === 'Open floor')
    expect(merged).toBeDefined()
    expect(merged!.confidence).toBe(0.58)
    expect(merged!.polygon.length).toBeGreaterThanOrEqual(4)
  })

  test('unknown ids and invalid targets throw', () => {
    expect(() =>
      applyOperation(sampleFloorModel, { op: 'delete', id: 'nope' }),
    ).toThrow(EditOperationError)
    expect(() =>
      applyOperation(sampleFloorModel, { op: 'relabel', id: 'w-top', label: 'x' }),
    ).toThrow(EditOperationError)
    expect(() =>
      applyOperation(sampleFloorModel, {
        op: 'merge',
        ids: ['r-sw', 'w-top'],
        label: null,
      }),
    ).toThrow(EditOperationError)
  })

  test('operation payloads validate', () => {
    expect(
      editOperationSchema.safeParse({ op: 'move', id: 'x', dx: 1, dy: 2 }).success,
    ).toBe(true)
    expect(editOperationSchema.safeParse({ op: 'noop', id: 'x' }).success).toBe(
      false,
    )
  })
})

describe('renderer', () => {
  test('renders every element with a data-id', () => {
    const svg = renderFloorModelSvg(sampleFloorModel)
    expect(svg).toStartWith('<svg')
    expect(svg).toContain('viewBox="0 0 1000 800"')
    for (const id of ['w-top', 'd-entry', 'r-corridor', 'f-stairs']) {
      expect(svg).toContain(`data-id="${id}"`)
    }
    expect(svg).toContain('>Corridor</text>')
    const dataIds = svg.match(/data-id="/g) ?? []
    expect(dataIds).toHaveLength(8 + 6 + 5 + 4)
  })
})
