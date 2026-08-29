import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { convertToTactile, type FloorModel } from '@bumps/floor-model'
import { db } from './db'
import { floorModels, tactileDesigns } from './db/schema'

export const tactileRoutes = new Hono()

// Deterministic conversion of the latest floor model into a tactile design.
// Re-running replaces nothing: each conversion is a new row, newest wins.
tactileRoutes.post('/:id/tactile', async (c) => {
  const projectId = c.req.param('id')
  const latest = await db.query.floorModels.findFirst({
    orderBy: desc(floorModels.version),
    where: eq(floorModels.projectId, projectId),
  })
  if (!latest) {
    return c.json({ error: 'No floor model for this project' }, 404)
  }
  const { design, notes } = convertToTactile(latest.model as FloorModel)
  await db.insert(tactileDesigns).values({
    design,
    floorModelVersion: latest.version,
    id: Bun.randomUUIDv7(),
    notes,
    projectId,
  })
  return c.json({ design, floorModelVersion: latest.version, notes }, 201)
})

tactileRoutes.get('/:id/tactile', async (c) => {
  const row = await db.query.tactileDesigns.findFirst({
    orderBy: desc(tactileDesigns.createdAt),
    where: eq(tactileDesigns.projectId, c.req.param('id')),
  })
  if (!row) {
    return c.json({ error: 'No tactile design for this project' }, 404)
  }
  return c.json({
    design: row.design,
    floorModelVersion: row.floorModelVersion,
    notes: row.notes,
  })
})
