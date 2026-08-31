<p align="center">
  <img src="apps/web/public/devpost-banner-v2.png" alt="A floor plan transformed into a raised tactile map with braille labels" width="100%" />
</p>

<h1 align="center">bumps</h1>

<p align="center">
  <strong>Floor plan in. Tactile map out.</strong><br />
  A web app that helps building owners create standards-validated, 3D-printable tactile maps for blind and low-vision visitors.
</p>

<p align="center">
  <a href="https://bumps-phi.vercel.app"><strong>Try the live app</strong></a>
  ·
  <a href="https://bumps-web-1096378308677.asia-south1.run.app/">Google Cloud deployment</a>
  ·
  <a href="output/pdf/bumps-technical-agent-architecture.pdf">Architecture PDF</a>
</p>

<!-- README-HACK:NEEDS-OWNER key="demo-video" instruction="Add the final public YouTube or Vimeo demo URL here." -->

## Why bumps

A sighted visitor can glance at a lobby map before entering an unfamiliar building. A blind visitor often has to ask for directions, memorize a verbal description, or learn the space by trial and error. A tactile map provides that missing mental model, but producing one is usually a slow, specialist commission that many libraries, schools, clinics, and small businesses cannot justify.

bumps automates the design bottleneck. A building owner uploads the floor plan they already have, reviews what the system understood, and receives printable map and braille-legend STL files. The goal is not to replace human judgment: it is to make a useful accessibility tool practical for far more buildings.

## What bumps does

1. **Upload:** Accept a PDF, PNG, JPG, or WebP floor plan up to 10 MB. PDFs are rasterized from the first page and large images are normalized for analysis.
2. **Extract:** Gemini agents on Vertex AI identify walls, rooms, doorways, stairs, elevators, entrances, labels, and other navigational features as structured JSON.
3. **Review:** The system critiques its extraction against the source image, rechecks doorway crops, and presents the latest version on an editable canvas. Users can edit directly or describe a correction in plain English.
4. **Convert:** Deterministic TypeScript creates the tactile plate, braille keys, symbols, relief layers, and legend, then validates the result against the encoded BANA 2022 and ADA §703 geometry rules.
5. **Export:** Only a design with zero remaining violations reaches Manifold mesh generation and becomes a watertight STL bundle.

### A real repository example

| Uploaded floor plan | Generated tactile design |
| --- | --- |
| ![A clear top-down library floor plan used as parser input](apps/web/public/gallery/test-library-floor-plan-source.png) | ![The corresponding raised tactile library design with braille keys and symbols](apps/web/public/gallery/test-library-floor-plan-design.svg) |

The public gallery includes downloadable STLs for libraries, museums, offices, public restrooms, and other test plans. Each entry pairs its source plan with the printable result.

## AI proposes. Geometry disposes.

The agent system does work that benefits from visual and semantic judgment, while deterministic code owns every safety-critical geometry decision.

- **ParserAgent** produces the typed `FloorModel` from the plan and detail crops.
- **CritiqueAgent** compares the source, model rendering, topology audit, and coverage evidence. A bounded TypeScript loop can refine the parse up to five times.
- **OpeningsAuditAgent** independently re-verifies doorways using magnified crops and proposes keep, move, delete, or add operations.
- **EditAgent** translates a user prompt into schema-checked operations against real element IDs; it cannot emit unrestricted geometry.
- **TactileLayoutAgent** may reposition labels and symbols when deterministic validation finds conflicts. The layout loop runs at most four times and never accepts a candidate with more violations.

The validator checks scale, minimum feature sizes, margins, seams, clearances, braille footprints, and label fit in millimetres. Mechanical repairs run before agent-assisted layout, and the export endpoint rejects unfinished or invalid designs.

## Architecture

[![Technical architecture showing the browser, Bun and Hono API, five Vertex AI agents, bounded review loops, Postgres persistence, deterministic tactile validation, and STL export](docs/graphs/technical-agent-architecture-readme.svg)](output/pdf/bumps-technical-agent-architecture.pdf)

The Next.js browser app communicates with a Bun and Hono API. Background parse and tactile jobs persist their status and versioned JSON in PostgreSQL. Google ADK agents call Gemini through Vertex AI, but the shared floor-model package, validation engine, and Manifold mesh generator remain deterministic. Source images and generated STL files currently use the service filesystem and are therefore prototype-only across container replacements.

## Built with

- **AI:** Google ADK for TypeScript, Gemini 3.7 Flash, Vertex AI
- **Web:** Next.js 16, React 19, TypeScript, Tailwind CSS, Three.js
- **API:** Bun, Hono, Zod, MuPDF, Resvg
- **Geometry:** deterministic TypeScript, Manifold 3D, binary STL generation
- **Data:** PostgreSQL, Drizzle ORM, versioned floor-model JSON
- **Cloud:** Vercel and Google Cloud Run; Render and Cloud SQL deployments; Cloud Build, Artifact Registry, Secret Manager

## What floor plans can I use?

bumps is designed for many single-floor architectural plans, not one hard-coded demo image. Upload a PDF, PNG, JPG, or WebP file up to 10 MB. For PDFs, the first page is used. The strongest inputs are:

- A straight, top-down view of one floor
- Clearly visible walls and doorway gaps
- High contrast with readable room labels
- Minimal shadows, perspective distortion, decorative rendering, or overlapping floors

The repository includes several different houses, schools, hotels, museums, and office plans under `test-assets/floor-plans/`. Start with the known-good sample below, then replace it with your own plan. The in-app guide at `/input-guide` shows supported and unsuitable examples side by side.

## Run locally and reproduce the demo

### 1. Prerequisites

- Bun 1.3 or newer
- Git
- Google Cloud CLI
- A Google Cloud project with Vertex AI access
- PostgreSQL 17, either installed locally or running in a container

Verify the required tools:

```bash
bun --version
gcloud --version
git --version
```

### 2. Clone and install the exact dependency set

```bash
git clone https://github.com/vimzh/bumps.git
cd bumps
bun install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The frozen lockfile keeps the installed versions consistent with the tested repository state.

### 3. Start PostgreSQL

Use any reachable PostgreSQL database. On macOS, use Colima as the Docker runtime and start it first if necessary:

```bash
colima status || colima start
```

Then start a disposable PostgreSQL 17 database:

```bash
docker run --name bumps-postgres \
  -e POSTGRES_USER=bumps \
  -e POSTGRES_PASSWORD=bumps \
  -e POSTGRES_DB=bumps \
  -p 5432:5432 \
  -d postgres:17-alpine
```

If port 5432 is already occupied, use your existing PostgreSQL instance and change `DATABASE_URL` accordingly.

### 4. Authenticate with Vertex AI

```bash
gcloud auth application-default login
gcloud config set project <your-project-id>
gcloud services enable aiplatform.googleapis.com
```

Your Google account or service account needs permission to invoke Vertex AI models in that project. bumps uses Gemini through Vertex AI; no third-party model gateway is required.

### 5. Configure the API and web app

Paste the following values into `apps/api/.env`:

```env
MODEL_PROVIDER=gemini
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=<your-project-id>
GOOGLE_CLOUD_LOCATION=global
USE_INTERACTIONS_API=false
MODEL_CRITICAL=gemini-3.7-flash
MODEL_FAST=gemini-3.7-flash
MODEL_LAYOUT=gemini-3.7-flash
MODEL_COMPARE=gemini-3.7-flash
DATABASE_URL=postgresql://bumps:bumps@localhost:5432/bumps
UPLOADS_DIR=data/uploads
```

Keep this value in `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3003
```

Do not commit either environment file.

### 6. Migrate and start both services

```bash
cd apps/api
bun run db:migrate
cd ../..
bun run dev
```

The root command starts the Next.js web app and Bun/Hono API in parallel:

- Web app: `http://localhost:3000`
- API: `http://localhost:3003`
- Input guide: `http://localhost:3000/input-guide`

In another terminal, verify the backend before uploading a plan:

```bash
curl http://localhost:3003/
```

A healthy response contains `"ok":true` and the active Gemini model configuration.

### 7. Reproduce the complete map pipeline

1. Open `http://localhost:3000`.
2. Upload `test-assets/floor-plans/house-bolduc.png`.
3. Wait for parsing. The progress view shows parsing, critique, and refinement stages.
4. Review the extracted rooms, walls, doors, and confidence flags on the canvas. Make a direct edit or try a prompt such as `rename the lobby Reception`.
5. Continue to tactile conversion. The deterministic validator and layout repair loop must reach zero violations.
6. Open the 3D preview and download the map and legend STL files.

A complete, error-free run can take approximately 10 minutes because Vertex AI may perform several multimodal review passes. Generated source files, intermediate artifacts, and STLs are stored under `apps/api/data/uploads/<project-id>/` when the API starts from `apps/api`.

After the known-good sample succeeds, repeat the same steps with another top-down plan from `test-assets/floor-plans/` or your own building. If a plan fails the input-quality check, use the in-app guide to remove perspective, isolate one floor, or export a clearer image.

### 8. Verify the repository

```bash
bun run typecheck
bun run lint
bun test packages/floor-model apps/api/src apps/web/src
```

The current repository passes type checking, linting, and 111 tests. The tests cover floor-model schemas, parser review gates, doorway auditing, tactile conversion, standards validation, mechanical repair, rasterization, braille geometry, editor constraints, and STL preview rendering.

### Adjusting the bounded loops

- Parse review: `MAX_ITERATIONS = 5` in `apps/api/src/agents/parse-loop.ts`
- Tactile layout: `MAX_LAYOUT_ITERATIONS = 4` in `apps/api/src/agents/tactile-layout.ts`

Increasing either limit allows more agent repair attempts but also increases Vertex AI calls and total processing time. Restart `bun run dev` after changing a limit.

## Prototype boundaries and next steps

The current product handles one floor per uploaded map and works best with clear, top-down architectural plans. PostgreSQL preserves project metadata and model versions, but source images and STL files still use ephemeral container storage.

Next steps are durable object storage, multi-floor navigation, contracted braille and additional languages, more physical print testing with blind readers, and outdoor public-space input.

## Standards and project documents

- [BANA Guidelines and Standards for Tactile Graphics, 2022](https://www.brailleauthority.org/tg/)
- [ADA Chapter 7: Signs and braille specifications](https://www.access-board.gov/ada/guides/chapter-7-signs/)
- [Product brief](docs/idea.md)
- [Requirements and hackathon alignment](docs/requirements.md)
- [Deployment notes](docs/deploy.md)
