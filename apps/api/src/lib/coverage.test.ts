import { describe, expect, test } from 'bun:test'
import { Resvg } from '@resvg/resvg-js'
import type { FloorModel } from '@bumps/floor-model'
import { computeInkCoverage } from './coverage'

// Synthetic source: a white 500x400 plan with two thick black wall lines.
const sourcePng = new Resvg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 400" width="500" height="400">
    <rect width="500" height="400" fill="white"/>
    <line x1="50" y1="100" x2="450" y2="100" stroke="black" stroke-width="18"/>
    <line x1="100" y1="50" x2="100" y2="350" stroke="black" stroke-width="18"/>
  </svg>`,
).render().asPng()

function modelWithWalls(walls: { ax: number; ay: number; bx: number; by: number }[]): FloorModel {
  return {
    features: [],
    furniture: [],
    openings: [],
    paths: [],
    plan: { heightPx: 400, north: null, pixelsPerMeter: null, widthPx: 500 },
    roads: [],
    rooms: [],
    schemaVersion: 1,
    title: null,
    walls: walls.map((w, i) => ({
      a: { x: w.ax, y: w.ay },
      b: { x: w.bx, y: w.by },
      confidence: 0.9,
      id: `w-${i}`,
      kind: 'wall',
      thickness: 18,
    })),
  }
}

describe('computeInkCoverage', () => {
  test('flags the region of a drawn wall missing from the model', () => {
    const report = computeInkCoverage(
      sourcePng,
      'image/png',
      modelWithWalls([{ ax: 50, ay: 100, bx: 450, by: 100 }]),
    )
    expect(report.coveredInkRatio).toBeLessThan(0.8)
    expect(report.regions.length).toBeGreaterThan(0)
    // The uncovered vertical wall runs along x=100, y=50..350.
    const hit = report.regions.some(
      (r) => r.x0 <= 110 && r.x1 >= 90 && r.y1 - r.y0 > 100,
    )
    expect(hit).toBe(true)
  })

  test('reports high coverage and no regions when the model traces everything', () => {
    const report = computeInkCoverage(
      sourcePng,
      'image/png',
      modelWithWalls([
        { ax: 50, ay: 100, bx: 450, by: 100 },
        { ax: 100, ay: 50, bx: 100, by: 350 },
      ]),
    )
    expect(report.coveredInkRatio).toBeGreaterThan(0.9)
    expect(report.regions).toHaveLength(0)
  })
})
