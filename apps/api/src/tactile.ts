import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  buildValidationContext,
  convertToTactile,
  floorModelSchema,
  type FloorModel,
} from '@bumps/floor-model'
import { runTactileLayout } from './agents/tactile-layout'
import { db } from './db'
import { floorModels, tactileDesigns } from './db/schema'

export const tactileRoutes = new Hono()

async function runConversion(rowId: string, model: FloorModel) {
  try {
    const { design: initial, notes } = convertToTactile(model)
    const context = buildValidationContext(model)
    const layout = await runTactileLayout(initial, context)
    await db
      .update(tactileDesigns)
      .set({
        design: layout.design,
        iterations: layout.iterations,
        notes,
        status: 'done',
        valid: layout.valid,
        violations: layout.violations,
      })
      .where(eq(tactileDesigns.id, rowId))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Layout failed'
    await db
      .update(tactileDesigns)
      .set({ error: message.slice(0, 400), status: 'failed' })
      .where(eq(tactileDesigns.id, rowId))
  }
}

// Convert the latest floor model, validate against the standards, and run
// the agent layout loop until zero violations or the iteration cap — in the
// background; the client polls GET. The stored `valid` flag is the export
// gate: false designs never print.
tactileRoutes.post('/:id/tactile', async (c) => {
  const projectId = c.req.param('id')
  const latest = await db.query.floorModels.findFirst({
    orderBy: desc(floorModels.version),
    where: eq(floorModels.projectId, projectId),
  })
  if (!latest) {
    return c.json({ error: 'No floor model for this project' }, 404)
  }
  const running = await db.query.tactileDesigns.findFirst({
    where: eq(tactileDesigns.projectId, projectId),
    orderBy: desc(tactileDesigns.createdAt),
  })
  if (running?.status === 'running') {
    return c.json({ status: 'running' }, 202)
  }
  const rowId = Bun.randomUUIDv7()
  const model = floorModelSchema.parse(latest.model)
  const { design, notes } = convertToTactile(model)
  await db.insert(tactileDesigns).values({
    design,
    floorModelVersion: latest.version,
    id: rowId,
    notes,
    projectId,
    status: 'running',
  })
  void runConversion(rowId, model)
  return c.json({ status: 'running' }, 202)
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
    error: row.error,
    floorModelVersion: row.floorModelVersion,
    iterations: row.iterations,
    notes: row.notes,
    status: row.status,
    valid: row.valid,
    violations: row.violations,
  })
})
