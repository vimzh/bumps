# Demo video script (~4 minutes)

Record at the deployed Cloud Run URL. One continuous flow, one project, real floor plan (use `test-assets/floor-plans/` — the office plan with furniture and a title block demos the critique loop best).

## 0:00–0:30 — The problem
- Landing page on screen ("bumps — maps you can feel").
- VO: "A blind visitor walks into an unfamiliar building with nothing. A tactile map fixes that — but each one is a custom commission from a specialist, so almost no building has one. bumps makes one from a floor plan, automatically."

## 0:30–1:20 — Upload → the parse loop (the Taskmaster moment #1)
- Click Upload floor plan, pick the plan. Land on the wizard.
- Point at the live loop line: "Pass 1/3 · Reviewing the extraction against the plan…" and the history ("pass 1: 2 findings · confidence 0.91").
- VO: "Two Gemini agents built with Google's ADK: a parser extracts walls, rooms, doors — then a critic compares a rendering of that extraction against the original image and sends it back to fix what's wrong. It also scores its own confidence per element."

## 1:20–2:20 — Edit: human in the loop
- The model appears. Point at dashed-red flagged elements and "Needs review · N".
- Confirm one from the panel; drag one element; show Next disabled until the list drains.
- Type into the prompt panel: "rename OFFICE 101 to Studio" → summary appears, canvas updates. Optionally: "delete this" with a door selected.
- Place "you are here" from the Add menu — "because a tactile map is read where it's mounted."
- VO: "Everything the AI did is reviewable. The agent that applies these prompts can only emit typed operations — it physically can't corrupt the model."

## 2:20–3:10 — Tactile conversion + the validator loop (Taskmaster moment #2)
- Click Next. Show "Converting & validating against tactile standards…", then the plate: braille dots, symbols, legend.
- Point at "Layout passes: 2 → 0" and the badge "Zero violations — ready to print".
- VO: "Deterministic code converts to a 200-millimeter plate under BANA and ADA rules — exact braille dot geometry, minimum fingertip clearances. Too big for one plate? It decides for you: a two-by-one or two-by-two grid, because a smaller map physically cannot be read by a finger. Geometry fixes what geometry can — labels are placed by search, seam conflicts by arithmetic — and an agent nudges only the judgment calls until the validator measures zero violations. Not zero? It cannot be exported."

## 3:10–3:40 — Export
- Click Next. Orbit the three.js STL — for a large venue this is the assembled multi-plate map as one seamless solid. Download one STL per plate + the legend.
- If a print exists, show the physical plate here and run a finger over it.
- VO: "A watertight STL — walls at one millimeter, symbols at one and a half, braille as spherical domes to ADA spec — plus a legend plate. Print it flat, no supports."

## 3:40–4:00 — Cloud proof + close
- Show the Cloud Run console with both services, then the browser URL bar (`*.run.app`).
- VO: "Two Cloud Run services, Gemini 3.5 Flash through the Agent Development Kit for TypeScript, everything else is deterministic TypeScript. A tactile map should cost a floor plan and a spool of filament — not a commission."
