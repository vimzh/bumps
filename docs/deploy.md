# Deploying bumps

The web app runs on Vercel. The Bun/Hono API and PostgreSQL database run in Render's Singapore region.

## API and database on Render

1. Create a Render Postgres database.
2. Set the API service's `DATABASE_URL` to the database's internal connection URL.
3. Keep the existing API commands:

```text
Build: bun install --frozen-lockfile && bun run --cwd apps/api build
Start: cd apps/api && bun run src/db/migrate.ts && bun src/index.ts
Health check: /
```

The start command applies pending Drizzle migrations before accepting requests. Configure the model provider and API key in Render as documented in `apps/api/.env.example`.

This is a fresh-database cutover. Existing local SQLite demo records are not copied because their stored upload and export paths are not valid on Render.

## Web on Vercel

Set `NEXT_PUBLIC_API_URL` to `https://bumps-api.onrender.com` and deploy `apps/web`. Git integrations on both hosts redeploy `main` automatically.

## Google Cloud proof deployment

The verified proof deployment uses Cloud Run, a private Cloud SQL PostgreSQL 17 instance, Secret Manager, Artifact Registry, Cloud Build, Direct VPC egress, and Vertex AI. It is live at `https://bumps-api-1096378308677.asia-south1.run.app` in project `project-1ba74e2d-51e2-4753-b63`.

Build and deploy the existing API image:

```bash
gcloud config set project project-1ba74e2d-51e2-4753-b63
gcloud services enable artifactregistry.googleapis.com cloudbuild.googleapis.com run.googleapis.com aiplatform.googleapis.com
gcloud artifacts repositories create bumps --repository-format=docker --location=asia-south1

IMAGE=asia-south1-docker.pkg.dev/project-1ba74e2d-51e2-4753-b63/bumps/api:latest
gcloud builds submit . --config cloudbuild.api.yaml --substitutions=_IMAGE=$IMAGE
gcloud run deploy bumps-api --image=$IMAGE --region=asia-south1 \
  --service-account=bumps-cloud-run@project-1ba74e2d-51e2-4753-b63.iam.gserviceaccount.com \
  --set-secrets=DATABASE_URL=bumps-database-url:latest \
  --set-env-vars=MODEL_PROVIDER=gemini,USE_INTERACTIONS_API=false,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=project-1ba74e2d-51e2-4753-b63,GOOGLE_CLOUD_LOCATION=global,MODEL_CRITICAL=gemini-3.7-flash,MODEL_FAST=gemini-3.7-flash,MODEL_LAYOUT=gemini-3.7-flash,MODEL_COMPARE=gemini-3.7-flash \
  --network=default --subnet=default --vpc-egress=private-ranges-only \
  --allow-unauthenticated --memory=1Gi --cpu=1 --min=0 --max=1 \
  --no-cpu-throttling --timeout=900 --concurrency=8
```

`bumps-database-url` contains the private Cloud SQL connection URL; never commit it. The Cloud Run service account receives only Secret Manager access and Vertex AI User. `USE_INTERACTIONS_API=false` is required because Vertex serves Gemini 3.7 Flash through `generateContent`, while ADK's Interactions path rejects that model. Cloud Run scales to zero between proof requests; the shared-core Cloud SQL instance is zonal with 10 GB storage, no public IP, backups, or automatic storage growth.

The deployed smoke test uploaded `library-floor-plan.png`, queried Cloud SQL, invoked Gemini 3.7 Flash through Vertex AI, and reached `status: parsed`. In the video, show the Cloud Run service page, active revision, request logs containing `backend: VERTEX_AI`, the Cloud SQL overview, and the successful JSON response from `/`.

## Storage limitation

Postgres preserves project metadata and generated models. Uploaded source images and STL files still use each container's ephemeral filesystem on Render and Cloud Run. Add object storage before treating projects as durable across restarts or revisions.
