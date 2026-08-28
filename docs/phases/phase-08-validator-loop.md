# Phase 8 — Standards validator + tactile layout loop

**Goal:** label/legend placement that ends at zero standards violations, via the second agent loop.

**Depends on:** Phase 7.

## Work

- Deterministic validator over the tactile design: every rule from the standards table — ≥ 3 mm element clearance (5–6 mm for similar symbols), ≥ 5 mm symbol size, braille geometry, plate margins. Output: machine-readable violation list with element ids and measured values.
- Legibility gate (part of the validator): after scaling to the plate, corridors and door openings must print ≥ 5 mm and every labeled room must fit its braille key. A floor that can't meet this at 200 × 200 fails the conversion with "floor too large for one plate — split or simplify"; layout iteration can't fix scale.
- Expose the validator as an ADK tool.
- TactileAgent (max thinking): given the tactile design + violations, proposes label/key placements and symbol nudges — as constrained placement operations, never raw geometry.
- LoopAgent: TactileAgent ↔ validator until **zero violations** (hard requirement) or iteration cap; on cap without success, the stage fails loudly and shows the remaining violations — never exports a non-compliant design.
- Wizard Tactile step shows the loop: violation count per iteration.

## Done when

A label-dense fixture converges to zero violations within the cap, and a deliberately impossible layout fails loudly with the violation list instead of exporting.
