# Deploying bumps to Cloud Run

Two services, both containerized from this repo's root context. Build with Cloud Build (local Docker Desktop needs ≥ 4 GB VM memory for the web build; the api image builds anywhere).

## One-time setup

```bash
gcloud config set project YOUR_PROJECT
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create bumps --repository-format=docker --location=us-central1
```

## 1. API service

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT/bumps/api \
  --file apps/api/Dockerfile .

gcloud run deploy bumps-api \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT/bumps/api \
  --region us-central1 --allow-unauthenticated \
  --memory 1Gi --min-instances 1 --max-instances 1 \
  --set-env-vars GEMINI_API_KEY=YOUR_KEY
```

Notes:
- `--min-instances 1 --max-instances 1`: SQLite and uploads live on the instance filesystem — a single warm instance keeps demo data alive between requests. Data still resets on redeploy (accepted for the demo; see requirements.md).
- For Vertex AI instead of an API key: drop `GEMINI_API_KEY`, set `GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT=... GOOGLE_CLOUD_LOCATION=...` and give the service account `roles/aiplatform.user`.

## 2. Web service

`NEXT_PUBLIC_API_URL` is inlined at build time — build web AFTER the api URL exists:

```bash
API_URL=$(gcloud run services describe bumps-api --region us-central1 --format 'value(status.url)')

gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT/bumps/web \
  --file apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=$API_URL .

gcloud run deploy bumps-web \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT/bumps/web \
  --region us-central1 --allow-unauthenticated --memory 512Mi \
  --set-env-vars AUTH_SECRET=$(openssl rand -base64 32)
```

## 3. Smoke test the deployed URL

```bash
WEB_URL=$(gcloud run services describe bumps-web --region us-central1 --format 'value(status.url)')
curl -s $API_URL/            # {"ok":true}
open $WEB_URL                # upload a plan, run the wizard end to end
```

## Validation already done locally

- Both Dockerfiles' dependency and runtime layout verified: the api image was built and smoke-tested in a container (boot loads resvg/manifold/mupdf natives, migration runs, PDF upload rasterizes); the web standalone output serves under Bun.
- The only unverified-in-Docker step is the web image's `next build` layer, which OOMs on a 2 GB Docker Desktop VM — Cloud Build default machines handle it.
