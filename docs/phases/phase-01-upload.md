# Phase 1 — Upload pipeline

**Goal:** a file goes in at `/`, a project exists, the user lands in the wizard.

**Depends on:** nothing (first phase).

## Work

- Strip the starter landing to the minimal hero: one-line value prop + single upload control (PDF/PNG/JPG). No other sections.
- `apps/api`: upload endpoint — validate type/size, store file on disk, rasterize PDFs to a normalized PNG (single page, first page for v1).
- Drizzle schema: `projects`, `floor_models` (versioned JSON, empty for now), `exports`. Migrate.
- On upload: create project → redirect to `/map/[id]` (wizard shell can be a stub).

## Done when

Uploading a PDF or image from `/` creates a DB row, a normalized PNG on disk, and lands on `/map/[id]` showing the uploaded plan.
