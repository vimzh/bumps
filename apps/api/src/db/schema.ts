import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourcePath: text('source_path').notNull(),
  planPath: text('plan_path').notNull(),
  status: text('status', {
    enum: ['uploaded', 'parsing', 'parsed', 'failed'],
  })
    .notNull()
    .default('uploaded'),
  parseError: text('parse_error'),
  // Live progress of the parse loop, polled by the web app while parsing.
  parseProgress: text('parse_progress', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const floorModels = sqliteTable('floor_models', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  version: integer('version').notNull(),
  model: text('model', { mode: 'json' }).notNull(),
  // Which parse-loop iteration produced this version (null for edits).
  iteration: integer('iteration'),
  // The critique that reviewed this version, when one ran.
  critique: text('critique', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const exports = sqliteTable('exports', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})
