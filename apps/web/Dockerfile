# Build from the repo root: docker build -f apps/web/Dockerfile .
# NEXT_PUBLIC_API_URL is inlined at build time — pass the api's public URL:
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://bumps-api.onrender.com .
FROM node:22-bookworm-slim AS builder
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/floor-model/package.json packages/floor-model/
RUN bun install --frozen-lockfile --linker=hoisted
COPY packages/floor-model packages/floor-model
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV AUTH_SECRET=build-placeholder
RUN cd apps/web && bun run build
RUN cp -RL apps/web/.next/standalone /standalone

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /standalone ./
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/apps/web/.next/static apps/web/.next/static
COPY --from=builder /app/apps/web/public apps/web/public
CMD ["node", "apps/web/server.js"]
