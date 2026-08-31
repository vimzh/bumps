import { describe, expect, test } from 'bun:test'
import { sampleFloorModel } from '@bumps/floor-model'

process.env.GEMINI_API_KEY ??= 'test-key'
const { applyOpeningsAudit, buildAuditTargets } = await import('./openings-audit')

describe('applyOpeningsAudit', () => {
  test('moves, deletes, and keeps openings per the audit, with notes', () => {
    const { model, notes } = applyOpeningsAudit(sampleFloorModel, [
      { confidence: 0.95, id: 'd-nw', op: 'keep', reason: 'clear gap' },
      {
        at: { x: 300, y: 480 },
        confidence: 0.85,
        id: 'd-sw',
        op: 'move',
        reason: 'gap center is left of reported point',
        width: 50,
      },
      { id: 'd-se', op: 'delete', reason: 'wall continuous, no gap' },
    ])
    expect(model.openings.find((o) => o.id === 'd-nw')!.confidence).toBe(0.95)
    const moved = model.openings.find((o) => o.id === 'd-sw')!
    expect(moved.at.x).toBe(300)
    expect(moved.width).toBe(50)
    expect(model.openings.some((o) => o.id === 'd-se')).toBe(false)
    expect(notes.join(' ')).toContain('removed d-se')
  })

  test('ignores implausible moves and adds away from entrances', () => {
    const { model, notes } = applyOpeningsAudit(sampleFloorModel, [
      {
        at: { x: 950, y: 40 },
        id: 'd-sw',
        op: 'move',
        reason: 'teleport',
      },
      {
        at: { x: 60, y: 60 },
        kind: 'door',
        op: 'add',
        reason: 'no entrance feature anywhere near',
      },
    ])
    expect(model.openings.find((o) => o.id === 'd-sw')!.at.x).toBe(250)
    expect(model.openings).toHaveLength(sampleFloorModel.openings.length)
    expect(notes.join(' ')).toContain('implausible')
  })

  test('adds a gate at an entrance feature, deduped against existing doors', () => {
    // f-entrance sits at (500, 720); d-entry already covers (500, 760).
    const noAdd = applyOpeningsAudit(sampleFloorModel, [
      { at: { x: 505, y: 755 }, kind: 'door', op: 'add', reason: 'gate drawn' },
    ])
    expect(noAdd.model.openings).toHaveLength(sampleFloorModel.openings.length)

    const without = {
      ...sampleFloorModel,
      openings: sampleFloorModel.openings.filter((o) => o.id !== 'd-entry'),
    }
    const added = applyOpeningsAudit(without, [
      { at: { x: 505, y: 755 }, confidence: 0.8, kind: 'door', op: 'add', reason: 'gate drawn' },
    ])
    expect(added.model.openings.some((o) => o.id.startsWith('gate-'))).toBe(true)
  })

  test('rejects the whole audit when it mass-deletes', () => {
    const ops = sampleFloorModel.openings.map((o) => ({
      id: o.id,
      op: 'delete' as const,
      reason: 'suspicious',
    }))
    const { model, notes } = applyOpeningsAudit(sampleFloorModel, ops)
    expect(model.openings).toHaveLength(sampleFloorModel.openings.length)
    expect(notes.join(' ')).toContain('rejected')
  })
})

describe('buildAuditTargets', () => {
  test('covers every opening and entrance, merging overlapping boxes', () => {
    const boxes = buildAuditTargets(sampleFloorModel)
    const labels = boxes.flatMap((b) => b.labels).join(' ')
    for (const opening of sampleFloorModel.openings) {
      expect(labels).toContain(opening.id)
    }
    expect(labels).toContain('f-entrance')
    expect(boxes.length).toBeLessThanOrEqual(12)
  })
})
