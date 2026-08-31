# Tactile Map — floor plan to 3D-printable tactile map for blind users

## Problem

Blind and low-vision people rely on tactile maps to build a mental model of a building before visiting it. Today these maps are made by hand: a specialist visits or studies the building, designs the tactile layout, produces it (swell paper, thermoform, or 3D print), and ships it. It is slow, expensive, and doesn't scale — most buildings simply never get one.

## Product

A web app that automates that pipeline: upload a floor plan (PDF or image) → AI parses it into an editable vector model → user refines it on a canvas (direct manipulation + a prompt-based edit panel) → one click converts it into a standards-compliant tactile design → one click produces a 3D-printable STL. Anyone with a consumer FDM printer can then print the map and mount it at an entrance, or hand it to a visitor.

Feasibility is well established by precedent: Touch Mapper has auto-generated tactile STLs from OpenStreetMap data since 2016 (outdoor maps), academic work has validated 3D-printed building floor plans with blind users (CHI 2023 "3D Building Plans", Monash Inclusive Technologies), and floor-plan recognition (walls/doors/rooms from raster images) is a mature computer-vision problem now handled well by multimodal models. The genuinely novel part — and our wedge — is combining automated parsing with a human-in-the-loop editor and a standards-compliant tactile conversion for **indoor** plans.

## User flow (wizard, one "Next" per stage)

Two routes, nothing else:

- **`/` (landing)** — minimal hero: one-line value prop and a single upload control (PDF/PNG/JPG). No feature grids, no marketing sections, no gradients. Uploading creates a project and redirects straight into the wizard.
- **`/map/[id]` (wizard)** — the whole pipeline as one stepper: Parse → Edit → Tactile → Export. One primary "Next" button, gated per stage; the current stage is always obvious.

1. **Upload** — PDF/PNG/JPG of a single floor. One floor per map for now.
2. **Parse** — an agent pipeline (Google ADK + Gemini) extracts a structured floor model: wall segments, door openings, rooms with labels, stairs, elevators, entrances, restrooms. Output is JSON vector data, not pixels. Parsing runs in a critique-refine loop, and every element carries a confidence score; low-confidence elements are flagged for the user in the next step.
3. **Edit** — minimal editable canvas (flat UI, no gradients/ornament). Left: the vector floor plan; user can select, move, resize, delete, relabel. Right: a prompt panel ("remove the furniture", "label this room Reception", "merge these two rooms") — an ADK edit agent translates prompts into operations on the vector model. Every change is visible immediately.
4. **Tactile conversion** (Next) — deterministic transform + agent-assisted layout: simplify geometry, drop visual-only detail, substitute standard tactile symbols, place braille labels (abbreviated keys) and generate the legend, enforce minimum sizes and spacing, resolve collisions.
5. **Export** (Next) — extrude the tactile design into a watertight mesh, show a 3D preview, download binary STL (plus the legend plate). Print settings hint shown next to the download.

## Standards the output must follow

These are the load-bearing numbers, from BANA's *Guidelines and Standards for Tactile Graphics* (2022), ADA §703 braille signage specs, and the tactile-map research literature (Eriksson et al., the 2022 *Cartographic Journal* guidelines review):

### Plate

- **One printable tile size: 200 × 200 mm, 3 mm base.** The converter chooses the smallest readable grid from 1×1 through 4×4 and slices it with exact seams. Each tile fits effectively every common consumer print bed — Ender-3 (220×220), Prusa MK4 (250×210), Bambu A1/P1/X1 (256×256).
- The grid is a readability limit, not permission to shrink indefinitely: doors, roads, and site-building footprints must still meet their printed-width gates. If 4×4 is insufficient, conversion fails loudly and the user must split the source into an overview plus per-wing maps.
- Content auto-scaled to fit with a mandatory margin; north arrow / orientation cue in a fixed corner; "you are here" marker optional.

### Relief heights (z-layers above the base)

| Element | Height | Notes |
|---|---|---|
| Floor / room interiors | 0 (base) | |
| Area textures (e.g. restrooms, restricted zones) | +0.5 mm | BANA area-symbol height |
| Walls (lines) | +1.0 mm | BANA line height; 2 mm wide so they survive FDM and stay above the ~3 mm min feature guidance for standalone elements |
| Point symbols (door, stairs, elevator, entrance) | +1.5 mm | BANA point-symbol height; distinct heights aid discrimination |
| Braille dots | +0.7 mm domes | ADA range is 0.64–0.94 mm; domed, not cylindrical |

### Braille (ADA §703.3 / BANA size & spacing)

- Dot base diameter 1.5–1.6 mm, dome-shaped.
- Dot-to-dot within a cell: 2.3 mm horizontal, 2.5 mm vertical (center-to-center).
- Cell-to-cell: 6.1 mm; line-to-line: 10 mm.
- Grade 1 (uncontracted) UEB for v1.

### Spacing & discrimination

- ≥ 3 mm clear space between any two distinct tactile elements (average fingertip resolution ≈ 2.4–3 mm); ≥ 5–6 mm between similar-shaped symbols.
- Minimum symbol size ~5 mm; same-shape symbols that differ only in size must differ ≥ 25–30 %.
- Full-word braille labels don't fit on-map: standard practice is **1–2 letter braille keys on the map + a legend** mapping keys to full names. The legend is generated automatically as a second, same-size plate (or the lower band of the plate when there are few labels).

### Symbol vocabulary (v1)

Fixed, BANA-consistent set: solid line = wall; gap + threshold bar = door; grooved ramp of shortening bars = stairs (direction = ascending); square with inner dot = elevator; filled arrow at perimeter = entrance; texture fill = restroom; raised dot = "you are here". Every symbol appears in the legend with its braille key.

## Architecture

```
apps/web (Next.js App Router + shadcn/ui, existing starter)
  minimal landing (/) · wizard (/map/[id]) · canvas editor · 3D preview (three.js)
apps/api (Bun + Hono, existing starter)
  upload handling · Render Postgres via Drizzle for projects/versions · hosts agents + geometry
agents (Google ADK for TypeScript, @google/adk — in-process inside apps/api)
  ParserAgent   : Gemini multimodal (max thinking budget) → floor model JSON, per-element confidence 0–1
  CritiqueAgent : renders the model, compares against the original image → discrepancies; drives the
                  parse LoopAgent (refine until critique passes / aggregate confidence ≥ 0.85, max 3)
  EditAgent     : user prompt + current model → list of edit operations (never free-form geometry)
  TactileAgent  : layout for labels/legend & collision resolution (max thinking budget), looped
                  against the deterministic validator until zero violations
  validator     : deterministic tool checking every rule in the standards table; hard fail, not advisory
  Low-confidence elements (< 0.7) are highlighted on the canvas and gate the wizard's Next.
geometry (TypeScript, deterministic — no AI)
  tactile transform (scale, simplify, symbolize) → 2D polygon layers → extrusion → binary STL writer
  (manifold-3d WASM for boolean/union robustness; braille dots as spherical caps)
```

Key principle: **AI proposes, geometry code disposes.** Parsing and editing are agent work; the standards enforcement and mesh generation are deterministic code so a compliant design can never be silently violated by a model.

## Persistence

PostgreSQL via Drizzle and Bun's SQL client: `projects`, `floor_models` (versioned JSON), `tactile_designs`, `exports`. Uploaded files remain on the API filesystem for the demo; database persistence does not make those files durable across service restarts.

## v1 scope cuts

- One floor per map, one plate size, one symbol set, Grade 1 braille, English labels.
- No multi-storey stacking, no embosser output, no swell-paper output, no print-service integration.
- Parser handles clean architectural plans first; hand-drawn/photographed plans are stretch.

## Open questions

- Gemini parsing accuracy on messy real-world plans — the edit canvas is the mitigation, but we should measure how much fixing a typical plan needs.
- Legend on-plate vs. separate plate: default to separate when > ~4 labels; validate with a blind tester.
- Print orientation guidance: research (CHI 2024) shows braille reads better printed at an angle, but flat-on-bed is the v1 recommendation for simplicity — revisit after test prints.
- Whether to emboss the map title in braille along the top edge by default.

## References

- BANA, *Guidelines and Standards for Tactile Graphics*, 2022 — https://www.brailleauthority.org/tg/
- ADA / US Access Board, §703 Signs (braille dimensions) — https://www.access-board.gov/ada/guides/chapter-7-signs/
- *Guidelines for Standardizing the Design of Tactile Maps* (Cartographic Journal, 2022) — https://www.tandfonline.com/doi/full/10.1080/00087041.2022.2097760
- Touch Mapper (prior art, outdoor) — https://touch-mapper.org / https://github.com/skarkkai/touch-mapper
- *3D Building Plans* (CHI 2023, blind-user validation of printed floor plans) — https://dl.acm.org/doi/full/10.1145/3544548.3581389
- Monash Inclusive Technologies, 3D Printed Maps — https://www.monash.edu/it/hcc/inclusive-technologies/projects/3d-printed-maps
- *Deep Floor Plan Recognition* (ICCV 2019) — https://arxiv.org/abs/1908.11025
- Google ADK — https://google.github.io/adk-docs/
