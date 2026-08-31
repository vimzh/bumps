# Requirements — All Things Agentic Hackathon (Taskmaster track)

Hackathon: https://allthingsagentichackathon.devpost.com · Deadline: **Aug 31, 2026, 5:00 PM PDT**

Product brief: [idea.md](idea.md). This doc locks the tech stack and the submission must-haves. No substitutions without updating this file.

## Track fit

**The Taskmaster** — agents that take a goal and carry out multi-step work. Our pitch: "upload a floor plan, get a standards-compliant 3D-printable tactile map" is a real manual workflow (specialist designs → produces → ships) automated end to end by an agent pipeline, with the user only steering.

## Locked stack

| Layer | Choice | Why / hackathon rule it satisfies |
|---|---|---|
| Model | **Gemini 3.6 Flash via the GA Interactions API** (default; env-selectable — `MODEL_CRITICAL`/`MODEL_FAST`/`USE_INTERACTIONS_API`), tiered thinking budgets by criticality | Required: Gemini 3.5 Flash **or newer** — 3.6 qualifies. Newer flash models are served only on the Interactions API, whose free-tier quota bucket is separate from the legacy endpoint's (3.5-flash free tier is 20 requests/day — too tight for the agent loops). The Interactions path doesn't enforce response schemas server-side, so agents carry JSON-only instructions + code-side extraction/validation with bounded re-asks |
| Agent framework | **Google ADK for TypeScript** (`@google/adk`) — ParserAgent, EditAgent, TactileAgent, ValidatorAgent | Required: ≥1 Google framework; official Google release, keeps the whole repo TypeScript |
| Cloud infra | **Vercel** (web) + **Render** (API and Postgres) | Current public deployment; retain separate GCP proof if the original hackathon requirement still applies |
| Web app | **Next.js (App Router) + shadcn/ui** (existing starter `apps/web`): minimal landing, wizard UI, canvas editor, three.js STL preview | Repo convention |
| API / agents host | **Bun + Hono** (existing starter `apps/api`): uploads, ADK agents, geometry, persistence | Hosted on Render for the current public demo |
| Geometry | **Deterministic TypeScript** in `apps/api` — tactile transform + extrusion + binary STL writer, manifold-3d (WASM) for booleans | Standards compliance must never depend on model output |
| Persistence | **Render Postgres via Drizzle + Bun SQL** (uploads on disk) | Database rows survive web-service restarts; uploaded files remain demo-only ephemeral storage |

Agents run in-process inside `apps/api` — no extra service beyond the starter's web/api split. The versioned floor-model JSON remains the only contract between agents and geometry code. (Verify `@google/adk` runs under Bun early; fall back to a Node runtime for `apps/api`'s container if not.)

Execution plan: [phases/](phases/) — 10 phases ordered by the product pipeline.

## Agent quality loop (must-have, not stretch)

Both critical stages run as ADK **LoopAgents** — generate → critique → refine, max 3 iterations:

- **Parse loop:** ParserAgent produces the floor model → CritiqueAgent compares a rendering of the model against the original plan image and reports missing/extra/misplaced elements → ParserAgent refines. Exit when critique passes or iterations exhaust.
- **Tactile loop:** TactileAgent proposes the layout → the deterministic validator (exposed as an ADK tool) reports every standards violation (spacing, sizes, collisions) → TactileAgent re-lays-out. Exit only at **zero violations**; violations are hard fails, never warnings.

**Confidence scoring (must-have):**

- Every element in the floor model carries `confidence: 0–1`, assigned by ParserAgent and updated by the critique loop.
- Elements below **0.7** are flagged on the edit canvas and listed in a "needs review" panel; the wizard's Next is gated on the user confirming or fixing them.
- Loop continuation is confidence-driven: keep iterating while aggregate confidence < **0.85** and iterations remain.
- Confidence is for AI uncertainty only — deterministic validator failures are binary and never expressed as confidence.

This is also the demo centerpiece for the 40% innovation criterion: the agent visibly self-corrects and knows what it doesn't know.

## Out of scope (locked)

Auth, multi-floor, embosser/swell outputs, print-service integration, non-English labels, hand-drawn plan support, and durable object storage.

## Submission checklist

- [x] Deployed on Vercel and Render, hosted URLs live — commands and storage limits documented in [deploy.md](deploy.md)
- [x] Repo with spin-up instructions — README run-locally section (repo currently private; make public or grant judge access before submitting)
- [x] Architecture diagram — mermaid in the root README
- [ ] ~4-min demo video — script ready in [demo-script.md](demo-script.md); record against the deployed URL
- [x] Text description — [submission.md](submission.md), ready to paste into Devpost

## Judging alignment (build priorities in order)

1. **Innovation & utility (40%)** — the end-to-end flow working on a real floor plan beats any single polished stage. Demo the agent making decisions (parsing, label placement, validation failures surfaced).
2. **Architecture (30%)** — clean web/agents/geometry separation; "AI proposes, geometry disposes" is the story.
3. **Demo & production readiness (30%)** — scripted video, reproducible repo, and live hosted URL.
