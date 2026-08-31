# Build from the repo root: docker build -f apps/web/Dockerfile .
# NEXT_PUBLIC_API_URL is inlined at build time — pass the api's public URL:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://bumps-api.onrender.com .
FROM oven/bun:1.3 AS builder
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/floor-model/package.json packages/floor-model/
RUN bun install --frozen-lockfile
COPY packages/floor-model packages/floor-model
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV AUTH_SECRET=build-placeholder
RUN cd apps/web && bun run build

FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static apps/web/.next/static
COPY --from=builder /app/apps/web/public apps/web/public
CMD ["bun", "apps/web/server.js"]
