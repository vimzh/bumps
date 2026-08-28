# Phase 5 — Wizard shell + edit canvas

**Goal:** the user can see and fix what the parser produced, by hand.

**Depends on:** Phase 2 (contract + renderer); runs on Phase 4 output. Can proceed in parallel with Phases 7–9.

## Work

- Wizard shell at `/map/[id]`: stepper (Parse → Edit → Tactile → Export), one primary Next button, gated per stage. Minimal flat UI — no gradients, no ornament.
- Edit canvas (left): the Phase 2 SVG renderer made interactive — select, move, resize, delete, relabel. Every interaction emits Phase 2 edit operations; each applied batch saves a new floor-model version (undo = previous version).
- Needs-review panel: lists elements with confidence < 0.7, click-to-focus on canvas; low-confidence elements visibly highlighted.
- Next is gated until every flagged element is confirmed or edited.

## Done when

A parsed plan can be corrected entirely by direct manipulation, the needs-review list drains as the user confirms/fixes, and Next unlocks exactly then.
