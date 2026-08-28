# Phase 6 — Prompt-based editing (EditAgent)

**Goal:** the right-side prompt panel — natural language in, edit operations out.

**Depends on:** Phase 5. First to cut if time runs short (canvas editing already covers the need).

## Work

- Prompt panel on the wizard's Edit step: input + short history of applied edits.
- EditAgent (fast model, low thinking): user prompt + current floor model → a list of Phase 2 edit operations. Never free-form geometry; operations referencing unknown element ids are rejected wholesale.
- Apply → new floor-model version → canvas re-renders. The panel echoes what the agent did in plain words ("Renamed room 12 to Reception; deleted 3 furniture outlines").
- Ambiguous prompts: agent asks one clarifying question instead of guessing.

## Done when

"Remove the furniture", "label the big room Reception", and "merge these two rooms" (with a selection) each produce correct, undoable canvas changes.
