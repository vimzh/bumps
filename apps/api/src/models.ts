import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  applyOperations,
  EditOperationError,
  editOperationSchema,
  floorModelSchema,
  renderFloorModelSvg,
  type FloorModel,
} from '@bumps/floor-model'
import { EditConversionError, runEditAgent } from './agents/edit'
import { db } from './db'
import { floorModels, projects } from './db/schema'

// Floor model versions are append-only: every save is a new version,
// which gives the editor undo and the critique loop its iteration trail.

async function latestModelRow(projectId: string) {
  return db.query.floorModels.findFirst({
    orderBy: desc(floorModels.version),
    where: eq(floorModels.projectId, projectId),
  })
}

// Stored models predate schema additions (e.g. furniture); re-parsing
// applies defaults so every model leaving the API is current-shape.
function normalizeModel(raw: unknown): FloorModel {
  return floorModelSchema.parse(raw)
}

async function projectExists(projectId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })
  return project !== undefined
}

export const modelRoutes = new Hono()

modelRoutes.post('/:id/model', async (c) => {
  const projectId = c.req.param('id')
  if (!(await projectExists(projectId))) {
    return c.json({ error: 'Project not found' }, 404)
  }
  const parsed = floorModelSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid floor model', issues: parsed.error.issues },
      422,
    )
  }
  const latest = await latestModelRow(projectId)
  const version = (latest?.version ?? 0) + 1
  await db.insert(floorModels).values({
    id: Bun.randomUUIDv7(),
    model: parsed.data,
    projectId,
    version,
  })
  return c.json({ version }, 201)
})

modelRoutes.get('/:id/model', async (c) => {
  const projectId = c.req.param('id')
  const requested = c.req.query('version')
  const row = requested
    ? await db.query.floorModels.findFirst({
        orderBy: desc(floorModels.version),
        where: (table, { and }) =>
          and(eq(table.projectId, projectId), eq(table.version, Number(requested))),
      })
    : await latestModelRow(projectId)
  if (!row) {
    return c.json({ error: 'No floor model for this project' }, 404)
  }
  return c.json({
    critique: row.critique,
    iteration: row.iteration,
    model: normalizeModel(row.model),
    version: row.version,
  })
})

modelRoutes.get('/:id/model/versions', async (c) => {
  const rows = await db.query.floorModels.findMany({
    columns: { createdAt: true, version: true },
    orderBy: desc(floorModels.version),
    where: eq(floorModels.projectId, c.req.param('id')),
  })
  return c.json({ versions: rows })
})

const operationsBodySchema = z.object({
  operations: z.array(editOperationSchema).min(1),
})

// Applies a batch of edit operations to the latest version and saves the
// result as a new version. The only write path besides a full model save.
modelRoutes.post('/:id/model/operations', async (c) => {
  const projectId = c.req.param('id')
  const latest = await latestModelRow(projectId)
  if (!latest) {
    return c.json({ error: 'No floor model for this project' }, 404)
  }
  const parsed = operationsBodySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid operations', issues: parsed.error.issues },
      422,
    )
  }
  let next: FloorModel
  try {
    next = floorModelSchema.parse(
      applyOperations(normalizeModel(latest.model), parsed.data.operations),
    )
  } catch (error) {
    if (error instanceof EditOperationError) {
      return c.json({ error: error.message }, 422)
    }
    return c.json({ error: 'Operations produced an invalid model' }, 422)
  }
  const version = latest.version + 1
  await db.insert(floorModels).values({
    id: Bun.randomUUIDv7(),
    model: next,
    projectId,
    version,
  })
  return c.json({ version }, 201)
})

const editBodySchema = z.object({
  prompt: z.string().min(1),
  selectedId: z.string().nullable().optional(),
})

// Natural-language editing: the EditAgent proposes operations, code validates
// and applies them; anything referencing unknown ids is rejected wholesale.
modelRoutes.post('/:id/model/edit', async (c) => {
  const projectId = c.req.param('id')
  const latest = await latestModelRow(projectId)
  if (!latest) {
    return c.json({ error: 'No floor model for this project' }, 404)
  }
  const body = editBodySchema.safeParse(await c.req.json())
  if (!body.success) {
    return c.json({ error: 'Invalid request', issues: body.error.issues }, 422)
  }

  let result
  try {
    result = await runEditAgent({
      model: normalizeModel(latest.model),
      prompt: body.data.prompt,
      selectedId: body.data.selectedId ?? null,
    })
  } catch (error) {
    if (error instanceof EditConversionError) {
      return c.json({ error: error.message }, 422)
    }
    const message = error instanceof Error ? error.message : 'Edit failed'
    return c.json({ error: message.slice(0, 300) }, 502)
  }

  if (result.action === 'clarify') {
    return c.json({ action: 'clarify', question: result.question })
  }

  let next: FloorModel
  try {
    next = floorModelSchema.parse(
      applyOperations(normalizeModel(latest.model), result.operations),
    )
  } catch (error) {
    if (error instanceof EditOperationError) {
      return c.json({ error: error.message }, 422)
    }
    return c.json({ error: 'Edit produced an invalid model' }, 422)
  }

  const version = latest.version + 1
  await db.insert(floorModels).values({
    id: Bun.randomUUIDv7(),
    model: next,
    projectId,
    version,
  })
  return c.json({
    action: 'applied',
    model: next,
    operationCount: result.operations.length,
    summary: result.summary,
    version,
  })
})

modelRoutes.get('/:id/model/svg', async (c) => {
  const row = await latestModelRow(c.req.param('id'))
  if (!row) {
    return c.json({ error: 'No floor model for this project' }, 404)
  }
  const svg = renderFloorModelSvg(normalizeModel(row.model))
  return c.body(svg, 200, { 'Content-Type': 'image/svg+xml' })
})
