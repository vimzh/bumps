# Phase 4 — Critique–refine loop + confidence gating

**Goal:** parsing self-corrects and knows what it doesn't know. This is the Taskmaster-track centerpiece — the agent visibly iterates.

**Depends on:** Phase 3.

## Work

- CritiqueAgent: takes the original plan image + an SVG render of the current floor model (Phase 2 renderer), returns discrepancies (missing/extra/misplaced elements) and confidence adjustments.
- Wrap ParserAgent + CritiqueAgent in an ADK LoopAgent: refine until critique passes, aggregate confidence ≥ 0.85, or 5 iterations.
- Persist each iteration as a floor-model version, with the critique attached — the wizard's Parse step shows the loop happening (iteration count, what the critique found, confidence trend).
- Surface per-element confidence downstream: elements < 0.7 marked `needsReview` for Phase 5 to render.

## Done when

A deliberately messy plan visibly improves across iterations in the UI, the loop exits on the right condition, and low-confidence elements come out flagged.
