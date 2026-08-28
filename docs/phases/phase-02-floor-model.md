# Phase 2 — Floor model & renderer

**Goal:** the versioned floor-model JSON contract, plus a renderer for it. Every later phase — parser, critique loop, editor, tactile transform — speaks this schema, so it comes before any AI.

**Depends on:** Phase 1.

## Work

- Zod schema for the floor model: wall segments, openings (door/window), rooms (polygon + label), features (stairs, elevator, entrance, restroom), plan metadata (pixel scale, orientation). Every element: stable `id` + `confidence: 0–1`.
- Edit-operation types (add/move/resize/delete/relabel/merge) — the only way the model changes, used by both canvas and EditAgent later.
- SVG renderer: floor model → clean 2D drawing. Reused by the edit canvas (Phase 5) and the critique loop (Phase 4).
- Persistence: floor model versions in `floor_models`, append-only (gives undo for free).
- Hand-write one fixture floor model for a sample plan (test data for everything downstream).

## Done when

The fixture model round-trips: validates against the schema, renders to a recognizable SVG of the plan, saves and loads through the API.
