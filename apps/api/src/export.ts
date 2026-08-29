import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { TactileDesign } from '@bumps/floor-model'
import {
  buildLegendMesh,
  buildMapMesh,
  buildPlateMeshes,
  meshInfo,
  meshToBinaryStl,
  type MeshInfo,
} from './geometry/mesh'
import { db } from './db'
import { exports as exportsTable, projects, tactileDesigns } from './db/schema'

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? 'data/uploads'

export const exportRoutes = new Hono()

// The export gate: only zero-violation designs become STLs.
exportRoutes.post('/:id/export', async (c) => {
  const projectId = c.req.param('id')
  const row = await db.query.tactileDesigns.findFirst({
    orderBy: desc(tactileDesigns.createdAt),
    where: eq(tactileDesigns.projectId, projectId),
  })
  if (!row || row.status !== 'done') {
    return c.json({ error: 'No finished tactile design for this project' }, 404)
  }
  if (!row.valid) {
    return c.json(
      {
        error: 'Design has standards violations — export is blocked',
        violations: row.violations,
      },
      409,
    )
  }

  const design = row.design as TactileDesign
  const grid = design.grid ?? { cols: 1, rows: 1 }
  const dir = path.join(UPLOADS_DIR, projectId, 'export')
  await mkdir(dir, { recursive: true })

  const files: { info: MeshInfo; kind: string; path: string }[] = []
  // 'map' is the assembled composite: the only file for a single plate,
  // and the seamless 3D preview for a multi-plate grid.
  const map = buildMapMesh(design)
  const mapPath = path.join(dir, 'map.stl')
  await Bun.write(mapPath, meshToBinaryStl(map.getMesh()))
  files.push({ info: meshInfo(map), kind: 'map', path: mapPath })

  // Multi-plate grids also get one print file per plate, sliced from the
  // same solid so assembled seams align exactly.
  const total = grid.rows * grid.cols
  for (const plate of buildPlateMeshes(design, map)) {
    const n = plate.row * grid.cols + plate.col + 1
    const kind = `plate-${n}of${total}`
    const platePath = path.join(dir, `${kind}.stl`)
    await Bun.write(platePath, meshToBinaryStl(plate.manifold.getMesh()))
    files.push({ info: meshInfo(plate.manifold), kind, path: platePath })
  }

  const legend = buildLegendMesh(design)
  if (legend) {
    const legendPath = path.join(dir, 'legend.stl')
    await Bun.write(legendPath, meshToBinaryStl(legend.getMesh()))
    files.push({ info: meshInfo(legend), kind: 'legend', path: legendPath })
  }

  for (const file of files) {
    await db.insert(exportsTable).values({
      id: Bun.randomUUIDv7(),
      kind: file.kind,
      path: file.path,
      projectId,
    })
  }
  return c.json(
    {
      files: files.map((file) => ({
        bbox: file.info.bbox,
        kind: file.kind,
        triangles: file.info.triangles,
      })),
      grid,
    },
    201,
  )
})

exportRoutes.get('/:id/export/:file', async (c) => {
  const projectId = c.req.param('id')
  const match = /^(map|legend|plate-[1-4]of[1-4])\.stl$/.exec(c.req.param('file'))
  if (!match) {
    return c.json({ error: 'Unknown export file' }, 404)
  }
  const kind = match[1]!
  const row = await db.query.exports.findFirst({
    orderBy: desc(exportsTable.createdAt),
    where: (table, { and }) =>
      and(eq(table.projectId, projectId), eq(table.kind, kind)),
  })
  if (!row) {
    return c.json({ error: 'No export yet' }, 404)
  }
  const file = Bun.file(row.path)
  if (!(await file.exists())) {
    return c.json({ error: 'Export file missing' }, 404)
  }
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })
  const base = (project?.name ?? 'tactile-map').replace(/\.[^.]+$/, '')
  return new Response(file, {
    headers: {
      'content-disposition': `attachment; filename="${base}-${kind}.stl"`,
      'content-type': 'model/stl',
    },
  })
})
