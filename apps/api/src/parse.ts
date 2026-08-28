import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { imageSize } from 'image-size'
import { runParseLoop, type ParseProgress } from './agents/parse-loop'
import { db } from './db'
import { floorModels, projects } from './db/schema'

async function setStatus(
  projectId: string,
  status: 'uploaded' | 'parsing' | 'parsed' | 'failed',
  parseError: string | null = null,
) {
  await db
    .update(projects)
    .set({ parseError, status })
    .where(eq(projects.id, projectId))
}

async function setProgress(projectId: string, progress: ParseProgress | null) {
  await db
    .update(projects)
    .set({ parseProgress: progress })
    .where(eq(projects.id, projectId))
}

async function runParse(projectId: string, planPath: string) {
  try {
    const bytes = await Bun.file(planPath).bytes()
    const { height, width } = imageSize(bytes)
    if (!width || !height) {
      throw new Error('Could not read plan image dimensions')
    }
    const baseVersion = await db.query.floorModels
      .findFirst({
        orderBy: desc(floorModels.version),
        where: eq(floorModels.projectId, projectId),
      })
      .then((row) => row?.version ?? 0)

    let savedCount = 0
    await runParseLoop({
      dimensions: { heightPx: height, widthPx: width },
      onProgress: (progress) => setProgress(projectId, progress),
      planPath,
      saveIteration: async (model, iteration, critique) => {
        savedCount += 1
        await db.insert(floorModels).values({
          critique,
          id: Bun.randomUUIDv7(),
          iteration,
          model,
          projectId,
          version: baseVersion + savedCount,
        })
      },
    })
    await setProgress(projectId, null)
    await setStatus(projectId, 'parsed')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown parse error'
    await setProgress(projectId, null)
    await setStatus(projectId, 'failed', message.slice(0, 500))
  }
}

export const parseRoutes = new Hono()

parseRoutes.post('/:id/parse', async (c) => {
  const projectId = c.req.param('id')
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  })
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }
  if (project.status === 'parsing') {
    return c.json({ error: 'Parse already running' }, 409)
  }
  await setStatus(projectId, 'parsing')
  await setProgress(projectId, null)
  // Fire and forget: the client polls GET /projects/:id for the outcome.
  void runParse(projectId, project.planPath)
  return c.json({ status: 'parsing' }, 202)
})
