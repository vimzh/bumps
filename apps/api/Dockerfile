# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/floor-model/package.json packages/floor-model/
RUN bun install --frozen-lockfile

FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=deps /app/packages/floor-model/node_modules packages/floor-model/node_modules
COPY packages/floor-model packages/floor-model
COPY apps/api apps/api
WORKDIR /app/apps/api
# SQLite + uploads live on the container filesystem: ephemeral on Cloud Run,
# which is acceptable for the demo (see docs/requirements.md).
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun src/index.ts"]
