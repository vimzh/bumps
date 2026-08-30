import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from './db'
import { projects } from './db/schema'
import { downscalePlanImage, pdfFirstPageToPng } from './lib/rasterize'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? 'data/uploads'

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function extensionFor(file: File): string | undefined {
  const byType = EXTENSION_BY_TYPE[file.type]
  if (byType) return byType
  const byName = path.extname(file.name).toLowerCase().replace('.', '')
  if (byName === 'jpeg') return 'jpg'
  return ['pdf', 'png', 'jpg', 'webp'].includes(byName) ? byName : undefined
}

export const projectRoutes = new Hono()

projectRoutes.post('/', async (c) => {
  const form = await c.req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'file field is required' }, 400)
  }
  const extension = extensionFor(file)
  if (!extension) {
    return c.json({ error: 'Only PDF, PNG, JPG, or WebP uploads are supported' }, 415)
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: 'File exceeds the 10 MB limit' }, 413)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let preparedPlan: Uint8Array | null = null
  if (extension === 'pdf') {
    try {
      preparedPlan = pdfFirstPageToPng(bytes)
    } catch {
      return c.json({ error: 'Could not read that PDF' }, 422)
    }
  } else {
    // Huge scans hurt the vision models; store a capped copy instead.
    const mime =
      extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
    try {
      preparedPlan = downscalePlanImage(bytes, mime)
    } catch {
      return c.json({ error: 'Could not read that image' }, 422)
    }
  }

  const id = Bun.randomUUIDv7()
  const projectDir = path.join(UPLOADS_DIR, id)
  await mkdir(projectDir, { recursive: true })
  const sourcePath = path.join(projectDir, `source.${extension}`)
  await Bun.write(sourcePath, bytes)
  const planPath = preparedPlan ? path.join(projectDir, 'plan.png') : sourcePath
  if (preparedPlan) await Bun.write(planPath, preparedPlan)

  await db.insert(projects).values({ id, name: file.name, planPath, sourcePath })
  return c.json({ id }, 201)
})

projectRoutes.get('/:id', async (c) => {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, c.req.param('id')),
  })
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }
  return c.json({
    createdAt: project.createdAt,
    id: project.id,
    name: project.name,
    parseError: project.parseError,
    parseProgress: project.parseProgress,
    status: project.status,
  })
})

projectRoutes.get('/:id/plan', async (c) => {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, c.req.param('id')),
  })
  if (!project) {
    return c.json({ error: 'Project not found' }, 404)
  }
  const plan = Bun.file(project.planPath)
  if (!(await plan.exists())) {
    return c.json({ error: 'Plan file missing' }, 404)
  }
  return new Response(plan)
})
