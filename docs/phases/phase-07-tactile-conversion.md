# Phase 7 — Tactile conversion (deterministic core)

**Goal:** finalized floor model → tactile design that follows the standards table in [idea.md](../idea.md). All deterministic TypeScript — no AI in this phase.

**Depends on:** Phase 2 (works off the fixture model; doesn't need the agents). Can proceed in parallel with Phases 5–6.

## Work

- Scale + fit: model → 200×200 mm plate with margin; drop sub-threshold detail (< 3 mm after scaling).
- Symbol substitution: doors → threshold bar, stairs → shortening-bars ramp, elevator → square + dot, entrance → perimeter arrow, restroom → area texture, walls → 2 mm / +1.0 mm lines.
- Braille: Grade 1 UEB translation, 1–2 letter keys per label, exact ADA cell geometry (1.5–1.6 mm dots, 2.3/2.5 mm dot pitch, 6.1 mm cell pitch).
- "You are here": the user-placed marker (mount location, set on the map page) converts to its distinctive raised symbol plus a braille key whose legend entry reads "you are here" — every finalized map that has the marker carries that braille text. If no marker was placed, conversion proceeds without it.
- Legend generation: key → full name, as the lower band of the plate when ≤ 4 labels, else a second 200×200 plate.
- Output: a *tactile design* document (2D polygon layers + z-height per layer) — the input to Phases 8 and 9.

## Done when

The fixture floor model converts to a tactile design whose every dimension matches the standards table, rendered as a layered 2D preview in the wizard's Tactile step.
