# Phase 10 — Deploy & Devpost submission

**Goal:** live on Vercel and Render, submitted before **Aug 31, 5:00 PM PDT**.

**Depends on:** everything demoable end to end (Phases 1–5 + 7–9 minimum).

## Work

- Deploy `apps/web` to Vercel and `apps/api` plus Postgres to Render; wire environment variables and the database connection.
- Smoke-test the full flow on the deployed URL, not just locally.
- Architecture diagram: web / api / agents / geometry / hosting boundaries, the two loops, the floor-model contract.
- ~4-minute demo video: upload → parse loop visibly iterating with confidence → canvas + one prompt edit → tactile conversion with validator loop → STL download + (ideally) the physical print. Include hosting-console proof of deployment.
- Devpost text: features, stack (Gemini 3.7 Flash, ADK for TypeScript, Vercel, Render), learnings. Repo public with spin-up instructions (`bun run setup`).

## Done when

Submission accepted on Devpost with live URL, public repo, diagram, and video — with margin before the deadline, not at it.
