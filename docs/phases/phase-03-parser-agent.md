# Phase 3 — ADK setup + ParserAgent

**Goal:** the uploaded plan image becomes a floor model, via Google ADK.

**Depends on:** Phase 2.

## Work

- **First task: verify `@google/adk` runs under Bun** in `apps/api`. If not, switch the api container to Node early — this decision must not land in Phase 10.
- Vertex AI auth + model IDs as env vars (`MODEL_CRITICAL`, `MODEL_FAST` — both Gemini 3.5 Flash for now; critical calls use max thinking budget).
- ParserAgent: plan image → floor model JSON. Structured output constrained to the Phase 2 Zod schema; the agent assigns per-element `confidence`.
- Wire into the wizard's Parse step: upload → parse → floor model v1 saved, with live status in the UI.
- Test against 3–5 real floor plans of varying messiness; record failure modes (feeds Phase 4).

## Done when

A real uploaded plan produces a schema-valid floor model that renders as a recognizable version of the plan, with plausible confidence values (messy regions score lower).
