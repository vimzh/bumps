# Phases

Execution plan for the tactile map product ([idea.md](../idea.md), [requirements.md](../requirements.md)), ordered the way the product pipeline flows. Each phase ends in something demoable.

| # | Phase | Pipeline stage |
|---|---|---|
| 1 | [Upload pipeline](phase-01-upload.md) | Landing → file in, project created |
| 2 | [Floor model & renderer](phase-02-floor-model.md) | The JSON contract everything speaks |
| 3 | [ADK + ParserAgent](phase-03-parser-agent.md) | Image → floor model |
| 4 | [Critique–refine loop](phase-04-critique-loop.md) | Parse self-correction + confidence |
| 5 | [Edit canvas](phase-05-edit-canvas.md) | Wizard shell + direct manipulation |
| 6 | [Prompt-based editing](phase-06-edit-agent.md) | EditAgent → edit operations |
| 7 | [Tactile conversion](phase-07-tactile-conversion.md) | Standards transform, braille, legend |
| 8 | [Validator + layout loop](phase-08-validator-loop.md) | Zero-violation tactile layout |
| 9 | [STL export](phase-09-stl-export.md) | Mesh, preview, download |
| 10 | [Deploy & submission](phase-10-deploy-submission.md) | Vercel + Render + Devpost |
| 11 | [Google Maps source](phase-11-google-maps-source.md) | Outdoor areas via 4-point selection (post-submission) |

Dependency shape: 1 → 2 → 3 → 4, then 5–6 (UI) can proceed in parallel with 7–9 (geometry) since both sit on the phase-2 contract. Phase 10 last before the deadline; 11 is a stretch that reuses the whole pipeline for outdoor areas. If time runs out, cut 6 before 4 — the loop + confidence is the track story.
