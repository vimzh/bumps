import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { exportRoutes } from './export'
import { modelRoutes } from './models'
import { parseRoutes } from './parse'
import { projectRoutes } from './projects'
import { tactileRoutes } from './tactile'

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
