import Module, {
  type CrossSection as CrossSectionT,
  type Manifold as ManifoldT,
  type Mesh,
} from 'manifold-3d'
import {
  BRAILLE_MM,
  RELIEF_MM,
  textDotCenters,
  textToBrailleCells,
  type Point,
  type TactileDesign,
  type TactileSymbol,
} from '@bumps/floor-model'

// Tactile design (mm, y-down screen space) -> watertight print meshes.
// 3D space is y-up: every point is flipped via yUp(); symbol shapes are
// authored y-up so design rotation values pass through unchanged.

const wasm = await Module()
wasm.setup()
const { CrossSection, Manifold } = wasm

const CIRCLE_SEGMENTS = 32
// Braille dome: spherical cap with base radius a and height h has
// sphere radius R = (a^2 + h^2) / 2h.
const DOT_RADIUS = BRAILLE_MM.dotDiameter / 2
const DOME_SPHERE_R =
  (DOT_RADIUS * DOT_RADIUS + BRAILLE_MM.dotHeight * BRAILLE_MM.dotHeight) /
  (2 * BRAILLE_MM.dotHeight)

type Poly2 = [number, number][]

function signedArea(poly: Poly2): number {
  let area = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j]![0] + poly[i]![0]) * (poly[j]![1] - poly[i]![1])
  }
  return area / 2
}

// CrossSection's Positive fill rule treats clockwise rings as holes; a
// flipped or model-supplied polygon can arrive CW and silently produce an
// empty (union-poisoning) manifold. Normalize every ring to CCW.
// (This shoelace variant is negative for CCW rings — verified empirically.)
function ofPolysCCW(polys: Poly2[]): CrossSectionT {
  return CrossSection.ofPolygons(
    polys.map((poly) => (signedArea(poly) > 0 ? [...poly].reverse() : poly)),
  )
}

function rect(w: number, h: number, cx = 0, cy = 0): CrossSectionT {
  return ofPolysCCW([
    [
      [cx - w / 2, cy - h / 2],
      [cx + w / 2, cy - h / 2],
      [cx + w / 2, cy + h / 2],
      [cx - w / 2, cy + h / 2],
    ],
  ])
}

function ring(outerR: number, thickness: number): CrossSectionT {
  return CrossSection.circle(outerR, CIRCLE_SEGMENTS).subtract(
    CrossSection.circle(outerR - thickness, CIRCLE_SEGMENTS),
  )
}

function frame(size: number, thickness: number): CrossSectionT {
  return rect(size, size).subtract(
    rect(size - 2 * thickness, size - 2 * thickness),
  )
}

// Symbol cross-sections, centered at origin, y-up.
function symbolCrossSection(symbol: TactileSymbol): CrossSectionT {
  const s = symbol.sizeMm
  const half = s / 2
  switch (symbol.symbol) {
    case 'door':
      return rect(s, 2)
    case 'stairs':
      return rect(s, 1.2, 0, 2.4 - 0.6)
        .add(rect(s * 0.75, 1.2, 0, 0))
        .add(rect(s * 0.5, 1.2, 0, -1.8))
    case 'elevator':
      return frame(s, 1).add(CrossSection.circle(0.9, CIRCLE_SEGMENTS))
    case 'entrance':
      return ofPolysCCW([
        [
          [0, half],
          [-half, -half],
          [half, -half],
        ],
      ])
    case 'exit':
      return frame(s, 1).add(rect(s * 1.1, 1).rotate(45))
    case 'restroom': {
      let cs = frame(s, 0.9)
      for (const [dx, dy] of [
        [-1.2, -1.2],
        [1.2, -1.2],
        [-1.2, 1.2],
        [1.2, 1.2],
      ] as const) {
        cs = cs.add(CrossSection.circle(0.6, 16).translate([dx, dy]))
      }
      return cs
    }
    case 'ramp':
      return ofPolysCCW([
        [
          [-half, -half],
          [half, -half],
          [half, half],
        ],
      ])
    case 'you-are-here':
      return ring(half, 1).add(CrossSection.circle(1.4, CIRCLE_SEGMENTS))
    case 'reception':
      return rect(s, 1.4, 0, -1.3).add(
        CrossSection.circle(1.1, CIRCLE_SEGMENTS).translate([0, 1.2]),
      )
    case 'seating':
      return rect(s, 1.2, 0, -1.6).add(rect(1.2, 3.4, -half + 0.6, 0.1))
    case 'info-point':
      return ring(half, 0.8)
        .add(CrossSection.circle(0.7, 16).translate([0, 1.4]))
        .add(rect(1.1, 2.6, 0, -0.9))
  }
}

function lineCrossSection(points: Point[], widthMm: number, yUp: (p: Point) => Point): CrossSectionT {
  let cs: CrossSectionT | null = null
  for (let i = 0; i < points.length - 1; i++) {
    const a = yUp(points[i]!)
    const b = yUp(points[i + 1]!)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    const half = widthMm / 2
    const ux = dx / len
    const uy = dy / len
    // Square caps: extend both ends by half the width.
    const ax = a.x - ux * half
    const ay = a.y - uy * half
    const bx = b.x + ux * half
    const by = b.y + uy * half
    const nx = -uy * half
    const ny = ux * half
    const quad = ofPolysCCW([
      [
        [ax + nx, ay + ny],
        [ax - nx, ay - ny],
        [bx - nx, by - ny],
        [bx + nx, by + ny],
      ],
    ])
    cs = cs ? cs.add(quad) : quad
  }
  return cs ?? ofPolysCCW([])
}

function brailleDomes(
  dots: Point[],
  baseMm: number,
  yUp: (p: Point) => Point,
): ManifoldT[] {
  return dots.map((dot) => {
    const p = yUp(dot)
    return Manifold.sphere(DOME_SPHERE_R, 24).translate([
      p.x,
      p.y,
      baseMm + BRAILLE_MM.dotHeight - DOME_SPHERE_R,
    ])
  })
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside
    }
  }
  return inside
}

export function buildMapMesh(design: TactileDesign): ManifoldT {
  const { baseMm, heightMm, widthMm } = design.plate
  const yUp = (p: Point): Point => ({ x: p.x, y: heightMm - p.y })
  const parts: ManifoldT[] = [Manifold.cube([widthMm, heightMm, baseMm])]
  const areaElements = design.elements.filter((e) => e.kind === 'area')

  for (const element of design.elements) {
    if (element.kind === 'line') {
      const cs = lineCrossSection(element.points, element.widthMm, yUp)
      parts.push(Manifold.extrude(cs, element.heightMm).translate([0, 0, baseMm]))
    } else if (element.kind === 'area') {
      const cs = ofPolysCCW([
        element.polygon.map((p) => {
          const q = yUp(p)
          return [q.x, q.y] as [number, number]
        }),
      ])
      parts.push(Manifold.extrude(cs, element.heightMm).translate([0, 0, baseMm]))
    } else if (element.kind === 'symbol') {
      const at = yUp(element.at)
      const cs = symbolCrossSection(element)
        .rotate(element.rotation)
        .translate([at.x, at.y])
      parts.push(Manifold.extrude(cs, element.heightMm).translate([0, 0, baseMm]))
    } else {
      // Braille on a furniture block rises from the block's surface.
      const lift =
        areaElements.find(
          (area) =>
            area.kind === 'area' && pointInPolygon(element.at, area.polygon),
        )?.heightMm ?? 0
      parts.push(
        ...brailleDomes(
          textDotCenters(element.key, element.at),
          baseMm + lift,
          yUp,
        ),
      )
    }
  }
  return Manifold.union(parts.filter((part) => !part.isEmpty()))
}

// Legend plate: title row, then key -> text rows, all Grade 1 braille.
export function buildLegendMesh(design: TactileDesign): ManifoldT | null {
  if (design.legend.length === 0) return null
  const { baseMm, heightMm, marginMm, widthMm } = design.plate
  const yUp = (p: Point): Point => ({ x: p.x, y: heightMm - p.y })
  const maxCells = Math.floor((widthMm - 2 * marginMm) / BRAILLE_MM.cellPitch)
  const rows: string[] = []
  if (design.title) {
    rows.push(design.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim())
  }
  for (const entry of design.legend) {
    rows.push(`${entry.key}  ${entry.text}`)
  }
  const parts: ManifoldT[] = [Manifold.cube([widthMm, heightMm, baseMm])]
  rows.forEach((row, index) => {
    let text = row
    while (text.length > 0 && textToBrailleCells(text).length > maxCells) {
      text = text.slice(0, -1)
    }
    const origin = {
      x: marginMm,
      y: marginMm + index * BRAILLE_MM.linePitch,
    }
    parts.push(...brailleDomes(textDotCenters(text, origin), baseMm, yUp))
  })
  return Manifold.union(parts.filter((part) => !part.isEmpty()))
}

export function meshToBinaryStl(mesh: Mesh): Uint8Array {
  const triCount = mesh.triVerts.length / 3
  const buffer = new ArrayBuffer(84 + triCount * 50)
  const view = new DataView(buffer)
  view.setUint32(80, triCount, true)
  const vp = mesh.vertProperties
  const np = mesh.numProp
  let offset = 84
  for (let t = 0; t < triCount; t++) {
    const i0 = mesh.triVerts[3 * t]! * np
    const i1 = mesh.triVerts[3 * t + 1]! * np
    const i2 = mesh.triVerts[3 * t + 2]! * np
    const ax = vp[i0]!, ay = vp[i0 + 1]!, az = vp[i0 + 2]!
    const bx = vp[i1]!, by = vp[i1 + 1]!, bz = vp[i1 + 2]!
    const cx = vp[i2]!, cy = vp[i2 + 1]!, cz = vp[i2 + 2]!
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    view.setFloat32(offset, nx, true)
    view.setFloat32(offset + 4, ny, true)
    view.setFloat32(offset + 8, nz, true)
    const verts = [ax, ay, az, bx, by, bz, cx, cy, cz]
    for (let i = 0; i < 9; i++) {
      view.setFloat32(offset + 12 + i * 4, verts[i]!, true)
    }
    view.setUint16(offset + 48, 0, true)
    offset += 50
  }
  return new Uint8Array(buffer)
}

export type MeshInfo = {
  bbox: { max: [number, number, number]; min: [number, number, number] }
  triangles: number
}

export function meshInfo(manifold: ManifoldT): MeshInfo {
  const box = manifold.boundingBox()
  const mesh = manifold.getMesh()
  return {
    bbox: {
      max: [box.max[0], box.max[1], box.max[2]],
      min: [box.min[0], box.min[1], box.min[2]],
    },
    triangles: mesh.triVerts.length / 3,
  }
}
