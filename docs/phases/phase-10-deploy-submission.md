# Phase 10 — Deploy & Devpost submission

**Goal:** live on Cloud Run, submitted before **Aug 31, 5:00 PM PDT**.

**Depends on:** everything demoable end to end (Phases 1–5 + 7–9 minimum).

## Work

- Dockerfiles for `apps/web` (Next.js) and `apps/api` (Bun — or Node if the Phase 3 ADK check forced the fallback); deploy both to Cloud Run; env vars + Vertex AI service account wired.
- Smoke-test the full flow on the deployed URL, not just locally.
- Architecture diagram: web / api / agents / geometry / Cloud Run boundaries, the two loops, the floor-model contract.
- ~4-minute demo video: upload → parse loop visibly iterating with confidence → canvas + one prompt edit → tactile conversion with validator loop → STL download + (ideally) the physical print. Include Cloud Run console proof of deployment.
- Devpost text: features, stack (Gemini 3.5 Flash, ADK for TypeScript, Cloud Run), learnings. Repo public with spin-up instructions (`bun run setup`).

## Done when

Submission accepted on Devpost with live URL, public repo, diagram, and video — with margin before the deadline, not at it.
