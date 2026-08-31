import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
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
  parseProgress: jsonb('parse_progress'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const floorModels = pgTable('floor_models', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  version: integer('version').notNull(),
  model: jsonb('model').notNull(),
  // Which parse-loop iteration produced this version (null for edits).
  iteration: integer('iteration'),
  // The critique that reviewed this version, when one ran.
  critique: jsonb('critique'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const exports = pgTable('exports', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const tactileDesigns = pgTable('tactile_designs', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  // Which floor model version this design was converted from.
  floorModelVersion: integer('floor_model_version').notNull(),
  design: jsonb('design').notNull(),
  notes: jsonb('notes').notNull(),
  // Standards validation outcome: zero violations is the export gate.
  valid: boolean('valid').notNull().default(false),
  violations: jsonb('violations').notNull().default([]),
  iterations: jsonb('iterations').notNull().default([]),
  status: text('status', { enum: ['running', 'done', 'failed'] })
    .notNull()
    .default('done'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
