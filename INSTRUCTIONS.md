# Running bumps

bumps turns a floor plan image into a 3D-printable tactile map for blind
navigation. This guide takes you from a clean machine to a downloaded STL.

## Prerequisites

- [Bun](https://bun.sh) 1.3 or newer (runs the API, the web app, and all tests)
- One model API key, either of:
  - **OpenRouter** key from https://openrouter.ai/settings/keys (recommended;
    all results in `pipeline_tests/REPORT.md` were produced with
    `google/gemini-3.7-flash` through OpenRouter), or
  - **Google AI Studio** key from https://aistudio.google.com (free tier works
    for a few parses per day)

## Setup

From the repository root:

```bash
bun install
cd apps/api && bun run db:migrate && cd ../..
cp apps/web/.env.example apps/web/.env.local   # local defaults work as-is
```

Create `apps/api/.env` with your key. OpenRouter:

```bash
MODEL_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
MODEL_CRITICAL=google/gemini-3.7-flash
MODEL_FAST=google/gemini-3.7-flash
MODEL_LAYOUT=google/gemini-3.7-flash
MODEL_COMPARE=google/gemini-3.7-flash
```

or Google AI Studio:

```bash
GEMINI_API_KEY=your-key
```

## Run

```bash
bun run dev
```

- Web app: http://localhost:3000
- API: http://localhost:3003

## Using it

1. **Upload** a floor plan (PDF, PNG, JPG, or WebP, up to 10 MB) on the home
   page. Not sure what to upload? Click **"Good and bad floor-plan examples"**
   right under the upload button (the `/input-guide` page). Clean, top-down 2D
   plans work best; the same page shows the inputs that get rejected, such as
   3D renders and perspective drawings. Ready-to-use samples also live in
   `test-assets/floor-plans/`.
2. **Parse.** A team of agents extracts walls, doors, rooms, stairs, and
   furniture, critiques its own work against the image, and audits every
   doorway against magnified crops. Expect 1 to 4 minutes and roughly 3 to 8
   model calls depending on plan complexity (each call is logged in the API
   terminal as `[llm] call #N`).
3. **Edit.** Review the extracted map on the canvas. Elements the pipeline is
   unsure about are flagged for review. Fix anything by direct manipulation or
   with a plain-English prompt in the side panel.
4. **Tactile.** One click converts the model into a BANA 2022 / ADA 703
   compliant tactile design and validates it rule by rule. Export is blocked
   until there are zero violations.
5. **Export.** Preview the plate in 3D and download the binary STL (plus a
   braille legend plate). Print flat on the bed, 0.4 mm nozzle, no supports.

## Verify the code

```bash
bun run typecheck
bun run lint
bun test packages/floor-model apps/api/src apps/web/src
```

## Environment reference

| Variable | Where | Purpose |
|---|---|---|
| `MODEL_PROVIDER` | `apps/api/.env` | `gemini` (default) or `openrouter` |
| `GEMINI_API_KEY` | `apps/api/.env` | AI Studio key (gemini provider) |
| `OPENROUTER_API_KEY` | `apps/api/.env` | OpenRouter key (openrouter provider) |
| `MODEL_CRITICAL` / `MODEL_FAST` / `MODEL_LAYOUT` / `MODEL_COMPARE` | `apps/api/.env` | Per-role model ids; default `gemini-3.7-flash` (or `google/gemini-3.7-flash` on OpenRouter) |
| `MODEL_MAX_OUTPUT_TOKENS` | `apps/api/.env` | Output cap per OpenRouter call (default 32768) |
| `DATABASE_URL` | `apps/api/.env` | PostgreSQL connection string |
| `NEXT_PUBLIC_API_URL` | `apps/web/.env.local` | API origin (default `http://localhost:3003`) |

No secrets ship in this archive; both `.env.example` files list every field.

## Evidence and study

`pipeline_tests/REPORT.md` documents the full validation study: the standards
audit, ten real-venue runs with before/after comparisons, and the improvement
changelog that produced the current pipeline.
