import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { projectRoutes } from './projects'

const app = new Hono()

app.use('*', cors())

app.get('/', (c) => {
  return c.json({ ok: true })
})

app.route('/projects', projectRoutes)

export default app
