import Module, {
  type CrossSection as CrossSectionT,
  type Manifold as ManifoldT,
  type Mesh,
} from 'manifold-3d'
import {
  BRAILLE_MM,
  compositeSize,
  paginateBrailleRows,
  RELIEF_MM,
  textDotCenters,
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
      // Equal rungs — the TREPPE/ladder consensus glyph on real maps.
      return rect(s, 1.2, 0, 1.8)
        .add(rect(s, 1.2, 0, 0))
        .add(rect(s, 1.2, 0, -1.8))
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
    case 'restroom':
      // Circle with a center dot — the WC glyph on CCH's installed legend.
      return ring(half, 0.9).add(CrossSection.circle(1.2, CIRCLE_SEGMENTS))
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
    case 'north':
      // Arrow: triangular head + shaft; rotation carries plan north.
      return ofPolysCCW([
        [
          [0, half],
          [-half * 0.55, half - 3],
          [half * 0.55, half - 3],
        ],
      ]).add(rect(1.2, s - 3, 0, -1.5))
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
    // Flat caps preserve the exact doorway gap between wall segments.
    const ax = a.x
    const ay = a.y
    const bx = b.x
    const by = b.y
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

// BANA broken-line convention for guide paths: short raised dashes.
const DASH_MM = 3
const DASH_GAP_MM = 2

function dashedLineCrossSection(
  points: Point[],
  widthMm: number,
  yUp: (p: Point) => Point,
): CrossSectionT {
  let cs: CrossSectionT | null = null
  const half = widthMm / 2
  for (let i = 0; i < points.length - 1; i++) {
    const a = yUp(points[i]!)
    const b = yUp(points[i + 1]!)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    const ux = dx / len
    const uy = dy / len
    const nx = -uy * half
    const ny = ux * half
    for (let t = 0; t < len; t += DASH_MM + DASH_GAP_MM) {
      const end = Math.min(t + DASH_MM, len)
      const ax = a.x + ux * t
      const ay = a.y + uy * t
      const bx = a.x + ux * end
      const by = a.y + uy * end
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

// Builds the ASSEMBLED map as one solid: a continuous base slab spanning
// the whole plate grid (no seams), with all relief on top. This is what the
// 3D preview shows; per-plate print files are sliced from it.
export function buildMapMesh(design: TactileDesign): ManifoldT {
  const { baseMm } = design.plate
  const { heightMm, widthMm } = compositeSize(design)
  const yUp = (p: Point): Point => ({ x: p.x, y: heightMm - p.y })
  const parts: ManifoldT[] = [Manifold.cube([widthMm, heightMm, baseMm])]
  const areaElements = design.elements.filter((e) => e.kind === 'area')

  for (const element of design.elements) {
    if (element.kind === 'line') {
      const cs =
        element.style === 'dashed'
          ? dashedLineCrossSection(element.points, element.widthMm, yUp)
          : lineCrossSection(element.points, element.widthMm, yUp)
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

// Slices the composite into per-plate print files. Each plate is the
// composite intersected with that plate's volume, moved to its own origin —
// cut from the same solid, so assembled plates align exactly at the seams.
export function buildPlateMeshes(
  design: TactileDesign,
  composite: ManifoldT,
): { col: number; manifold: ManifoldT; row: number }[] {
  const grid = design.grid ?? { cols: 1, rows: 1 }
  if (grid.rows * grid.cols <= 1) return []
  const { heightMm, widthMm } = design.plate
  const total = compositeSize(design)
  const plates: { col: number; manifold: ManifoldT; row: number }[] = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      // Design row 0 is the TOP row; mesh y is flipped (y-up).
      const y0 = total.heightMm - (row + 1) * heightMm
      const box = Manifold.cube([widthMm, heightMm, 60]).translate([
        col * widthMm,
        y0,
        -10,
      ])
      plates.push({
        col,
        manifold: composite.intersect(box).translate([-col * widthMm, -y0, 10 - 10]),
        row,
      })
    }
  }
  return plates
}

// Legend plates: title row, then key -> text rows, all Grade 1 braille.
export function buildLegendMeshes(design: TactileDesign): ManifoldT[] {
  if (design.legend.length === 0) return []
  const { baseMm, heightMm, marginMm, widthMm } = design.plate
  const yUp = (p: Point): Point => ({ x: p.x, y: heightMm - p.y })
  const rows: string[] = []
  if (design.title) {
    rows.push(design.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim())
  }
  for (const entry of design.legend) {
    rows.push(`${entry.key}  ${entry.text}`)
  }
  return paginateBrailleRows(rows, design.plate).map((page) => {
    const parts: ManifoldT[] = [Manifold.cube([widthMm, heightMm, baseMm])]
    page.forEach((text, index) => {
      const origin = {
        x: marginMm,
        y: marginMm + index * BRAILLE_MM.linePitch,
      }
      parts.push(...brailleDomes(textDotCenters(text, origin), baseMm, yUp))
    })
    return Manifold.union(parts.filter((part) => !part.isEmpty()))
  })
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
