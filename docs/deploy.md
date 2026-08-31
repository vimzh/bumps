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

## Storage limitation

Postgres preserves project metadata and generated models. Uploaded source images and STL files still use the Render web service's filesystem, which is ephemeral on the free plan. Add object storage before treating projects as durable across restarts.
