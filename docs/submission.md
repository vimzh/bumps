# Devpost submission text

**Track:** The Taskmaster

## Inspiration

A blind visitor entering an unfamiliar building gets nothing that every sighted visitor gets for free: a picture of the layout. Tactile maps solve this — read one at the entrance with your fingertips and you carry the building with you — but each map is a manual commission: a specialist studies the plan, designs to tactile standards, produces, ships. Slow and expensive enough that almost no building has one. The printers already exist everywhere; the design step is the bottleneck. That's the step we automated.

## What it does

Upload a floor plan (PDF/PNG/JPG) → an agent pipeline extracts the structure → you review on an editable canvas (drag things, or just type "rename the lobby") → deterministic code converts it into a standards-compliant tactile design → download a watertight STL (plus a braille legend plate) for any consumer 3D printer. Mark "you are here" for where the plate will be mounted, and the phrase is embossed in braille via the legend.

## How we built it (multi-step autonomy)

Four ADK agents on Gemini 3.5 Flash, two self-correcting loops, and a hard rule: **AI proposes, geometry disposes.**

- **Parse loop:** ParserAgent (schema-constrained structured output, per-element confidence) ↔ CritiqueAgent, which compares a *rendering* of the extraction against the original image and reports typed findings. Refines until confidence converges — on our test plan it found 2 major geometry errors in pass 1 and fixed them in pass 2.
- **EditAgent** turns prompts into typed edit operations validated against real element ids — it can rename, move, merge, add, delete, but never emit raw geometry; ambiguous requests get one clarifying question instead of a guess.
- **Layout loop:** deterministic validator (BANA 2022 + ADA §703, measured in millimeters: 3 mm fingertip clearance, 5 mm symbols, braille footprints inside their rooms, a legibility gate against too-large floors) ↔ TactileAgent, which may only nudge braille and symbols. Export is blocked until the validator measures **zero violations**.
- **Geometry engine** (no AI): manifold-3d extrusion with braille as true spherical caps at exact ADA dot pitch; exported STLs verify watertight (0 unmatched edges).

Stack: ADK for TypeScript · Gemini 3.5 Flash · two Cloud Run services (Next.js web, Bun+Hono api) · SQLite via Drizzle · shared zod contract package with tests.

## Challenges

- Gemini's response-schema subset rejects common zod idioms (`.positive()` → `exclusiveMinimum`); we learned to author LLM-facing schemas inside the subset and re-validate with strict schemas after.
- ADK surfaces model failures as events, not exceptions — swallowing them silently was our worst early bug.
- Braille is unforgiving: a mirrored y-axis or a wrong dot pitch produces gibberish under a fingertip, so braille geometry lives in exactly one module shared by preview, validator, and mesh.
- Discriminated unions don't survive structured output; the EditAgent emits a flat shape that code converts and rejects wholesale on any invalid reference.

## Accomplishments

Upload → printable STL in under five minutes with a human review in the middle; a validator that refuses to export non-compliant maps; agents that visibly self-correct and know what they don't know (per-element confidence gates the wizard).

## What's next

Tactile maps of outdoor public spaces — parks, campuses — via Google Maps: search an area, mark four corners, same pipeline (phase 11 in the repo). Multi-plate output for large buildings. Contracted braille and more languages.
