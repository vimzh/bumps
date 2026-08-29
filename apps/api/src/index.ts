import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db'
import { projects, tactileDesigns } from './db/schema'
import { exportRoutes } from './export'
import { modelRoutes } from './models'
import { parseRoutes } from './parse'
import { projectRoutes } from './projects'
import { tactileRoutes } from './tactile'

// Background jobs die with the process; on boot, fail anything a previous
// process left mid-flight so it can be retried instead of blocking forever.
await db
  .update(tactileDesigns)
  .set({ error: 'Interrupted by a server restart — run again', status: 'failed' })
  .where(eq(tactileDesigns.status, 'running'))
await db
  .update(projects)
  .set({
    parseError: 'Interrupted by a server restart — try again',
    parseProgress: null,
    status: 'failed',
  })
  .where(eq(projects.status, 'parsing'))

const app = new Hono()

app.use('*', cors())

app.get('/', (c) => {
  return c.json({ ok: true })
})

app.route('/projects', projectRoutes)
app.route('/projects', modelRoutes)
app.route('/projects', parseRoutes)
app.route('/projects', tactileRoutes)
app.route('/projects', exportRoutes)

// Cloud Run provides PORT; local dev overrides via --port in the dev script.
export default {
  fetch: app.fetch,
  idleTimeout: 30,
  port: Number(process.env.PORT ?? 3003),
}
