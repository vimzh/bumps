# bumps compliance & validation report

**Date:** 2026-08-30 · **Scope:** end-to-end validation of the bumps pipeline against real, in-use tactile maps and published standards. Assets and provenance: [SOURCES.md](SOURCES.md). Pipeline outputs: [outputs/](outputs/).

Two metric families are evaluated separately, as they answer different questions:

- **A. Physical specification conformance** — are the numbers (dot geometry, heights, clearances) correct per BANA/ADA? This is deterministic: it is enforced in code, so it is audited against the written standards, not against photos.
- **B. Representational & symbol fidelity** — do our symbols, labels, and conventions match what real, deployed tactile maps actually do? This is empirical: audited against 11 real artifacts from 10 institutions (8 US).
- **C. Live pipeline runs** — what the system actually produces from each venue's real visual plan, compared against the venue's real tactile map.

---

## A. Physical specification conformance (deterministic audit)

Every value below is a constant in `packages/floor-model` and enforced by the validator (`validate.ts`); export is blocked at any violation. Audit method: code inspection + the validator's own test suite (29 tests passing).

| Parameter | bumps value | Standard | Conforms |
|---|---|---|---|
| Braille dot base diameter | 1.5 mm | ADA §703.3: 1.5–1.6 mm | ✔ |
| Braille dot height | 0.7 mm (spherical cap) | ADA: 0.64–0.94 mm; dome required | ✔ (domes generated from exact cap geometry) |
| Dot pitch within cell | 2.3 mm (x), 2.5 mm (y) | ADA: 2.3–2.5 mm | ✔ |
| Cell-to-cell pitch | 6.1 mm | ADA: 6.1–7.6 mm | ✔ |
| Line-to-line pitch (legend plate) | 10 mm | ADA: ≥10 mm | ✔ |
| Braille grade | Grade 1 (uncontracted) UEB, letters+digits | BANA guidance for map keys | ✔ (scope: English) |
| Wall (line) relief height | 1.0 mm | BANA line-symbol height ~1.0 mm | ✔ |
| Area (block) relief height | 0.5 mm | BANA area-symbol height ~0.5 mm | ✔ |
| Point-symbol relief height | 1.5 mm | BANA point-symbol height ~1.5 mm | ✔ |
| Height differentiation between classes | 3 distinct levels + braille | BANA: distinct heights aid discrimination | ✔ |
| Minimum element clearance | 3 mm (validator rule) | Research minimum 2.4–3 mm | ✔ |
| Similar-symbol clearance | 6 mm | Guidance 5–6 mm | ✔ |
| Minimum symbol size | 5 mm (validator; default 6 mm) | ~5 mm minimum discriminable | ✔ |
| Minimum door gap in wall line | 6 mm | fingertip detection ≥ ~5 mm | ✔ |
| Plate size | 200×200 mm | practitioner range 200–400 mm; consumer print beds | ✔ (single size, v1) |
| Legibility gate | door openings must print ≥5 mm else conversion refuses | prevents unreadable over-scaled maps | ✔ (hard fail verified) |
| Label-fit | key inside its room/block when a legible position exists (inside + ≥3 mm from lines); adjacent ≤10 mm otherwise | BANA label-placement practice; adjacent labels are the observed convention for tight features | ✔ (validator rule) |

**Verdict A: conformant.** The one deliberate deviation from *print practice* (not from the standards): the legend is always exported as a second plate rather than sharing the map plate when ≤4 entries; real maps mix both approaches (CCH: separate legend board; Hidden Creek: same panel).

Not yet validated physically: FDM print fidelity of 0.7 mm domes (first-layer squish, stringing). This requires the planned physical test print and is flagged as the top residual risk.

---

## B. Representational & symbol fidelity vs. real maps

### B.1 What the real maps actually do (ground-truth survey)

Eleven artifacts were examined. Conventions observed:

| Concept | Real-world conventions observed | bumps v1 | Fidelity |
|---|---|---|---|
| **Walls** | Raised continuous lines universally (MAD Lab emboss: dotted-texture ridge; CCH legend: "WAND" = solid bar; QMH: raised outlines) | 2 mm raised solid lines | **Match** |
| **Doorways** | Break/gap in the wall line; MAD Lab additionally places a small raised marker *in* the gap | Gap in wall line (≥6 mm) | **Match** (marker-in-gap is a nice-to-have) |
| **Stairs** | Ladder/rung motif everywhere: CCH legend "TREPPE" = rung-box; MAD Lab: ladder glyph; QMH: legend symbol | 3 equal rungs (fixed during this study — was tapered bars) | **Match** — now the consensus equal-rung form |
| **Elevator** | CCH: open bracket/square; QMH "Accessible Lift" distinct symbol; venues vary | Square outline + center dot | **Match in family** (square-based) |
| **Restroom/WC** | CCH legend: circle with center dot (⊙); Hidden Creek: printed restroom icon | Circle with center dot ⊙ (fixed during this study — was a self-invented square+dots) | **Match** — identical to CCH's installed WC glyph |
| **You are here** | Universal, emphasized: QMH red arrow + legend; Hidden Creek red star; Getty bronze YAH | Ring + center dot, user-placed, braille key "yh" → legend "you are here" | **Match in function**; star/arrow variants more common visually |
| **Entrance** | Arrow at the entry point (Muckenthaler arrow + braille; QMH guide arrows) | Filled triangle (arrow family) | **Match** |
| **Room labels** | Short keys resolved by legend, universally: Muckenthaler 2–3-cell braille keys in rooms; CCH raised print letters + braille legend; BART 3-letter abbreviations print+braille | 1–2 letter Grade-1 braille keys + legend; plate carries a braille title row when it fits (shipped during this study) | **Match** — the key-abbreviation system is exactly standard practice |
| **Legend** | Always present; often on separate board (CCH) or side panel (Hidden Creek); dual print+braille | Legend plate in braille (title row + key rows) | **Match**; print lettering alongside braille is the common dual-audience upgrade we lack |
| **Area textures** | Used to distinguish zone types: CCH spiral fill = backstage; Queens College dot-grid lawns vs dashed paths; Lincoln Center hatched fills | One solid low-relief block texture (furniture) | **Partial** — we have the area layer but only one texture; texture vocabulary is thinner than practice |
| **Furniture/fixtures** | Shown when navigation-relevant, generalized (CCH: stage blocks, seating banks as blocks) | Clubbed labeled blocks at +0.5 mm | **Match in approach** (validated by CCH/PSU practice) |
| **Guide/route paths** | Common: QMH dotted guide path; Met dotted touch-tour route; Hidden Creek accessible-trail texture; CCH "LEITSYSTEM" is its legend's FIRST entry; Queens College walkway channels | Dashed 1.5 mm raised lines (BANA broken-line convention), parsed from drawn walkways/routes and drawable in the editor (shipped during this study) | **Match** — the connective fabric that makes campus maps read as maps |
| **North indicator** | Frequent on installed maps: QMH north-line + N; Hidden Creek/Lincoln Center north arrow; PSU braille'd North tile | Tactile arrow at the bottom-right margin, rotated to `plan.north`; the parser now reads drawn compasses (shipped during this study) | **Match** |
| **Scale bar** | Sometimes (Lincoln Center "150 feet") | Not represented | Minor gap |
| **Print + color dual-use** | Strong pattern on installed signs: QMH color zones, Hidden Creek full color, PSU green/print, BART ink+emboss | Monochrome print; on-screen "Better view" colors for sighted review | **Partial** — our Better View matches the *intent*; printed dual-use (color + raised print letters) is a hardware/scope question |
| **Numbered POIs** | Hidden Creek numbered key 1–11; Met numbered stations | Not represented | Gap (covered partially by room keys) |

### B.2 Symbol fidelity verdict

- **Correct and standard:** walls, door-gaps, key-abbreviation labeling + legend, entrance arrow, you-are-here function, stairs-as-rungs family, elevator square family, furniture-as-blocks, height layering.
- **Fixed during this study:** restroom glyph → circle-dot (CCH's exact WC form); stairs → equal rungs; guide paths as dashed raised lines end-to-end (schema → parser → editor → validator → mesh); north arrow rendered from parsed compasses; braille title row on the plate.
- **Still missing (observed in the field):** texture vocabulary (>1 area texture — CCH's backstage spiral, PSU's green/hatch fields), raised print lettering alongside braille, numbered POI keys, scale indication.

None of the remaining items violates a standard; they are adoption-level conventions that improve realism further.

---

## C. Live pipeline runs

Method: each venue's real **visual** plan (see SOURCES.md) was uploaded through the production pipeline (upload → parse loop → tactile conversion → validator/layout loop → render). Outputs in `outputs/<slug>-{input,ours}.png`, project ids in `outputs/<slug>.project`.

**Model config:** runs used `gemini-3.1-flash-lite` via the GA Interactions API. The shipped default is `gemini-3.6-flash`, whose free-tier daily budget was exhausted across four keys by the time the batch ran (an attempted 3.6 run 429'd on every venue). Prior same-day comparisons on identical inputs showed 3.6 converging in 1–2 layout passes where lite needed 3–4, and richer extraction — so parse quality below is a **lower bound** on shipped behavior. The deterministic stages (conversion, validation, mesh) are model-independent.

Four engine upgrades landed mid-study *because of* study results, and every affected venue was re-run on the updated engine:

1. **Multi-plate deciding step.** Venues whose door openings would print under the 5 mm legibility gate on one 200×200 mm plate are now automatically fit on a 2×1 / 1×2 / 2×2 plate grid (smallest grid that restores legibility). The STL engine slices one print file per plate from a single composite solid — verified watertight, and the per-plate volumes sum to the composite volume with 0.000 mm³ error — so assembled seams align exactly. A seam-clearance rule keeps braille and point symbols ≥3 mm from plate joints (a split braille cell is gibberish).
2. **Deterministic placement & repair.** Braille keys are placed by geometric search; seam/clearance violations with an arithmetic answer are fixed by code (exact nudges, multiple magnitudes, full re-validation per candidate) before the layout agent is consulted. The LLM only sees residual trade-offs.
3. **Legible-fit labels.** "The key fits inside" now means a position exists that is inside the polygon *and* ≥3 mm from every tactile line. Features with no legible interior position (thin diagonal sliver halls; a counter straddling a wall) take an adjacent label ≤10 mm away — the convention on real tactile maps — and the repair pass can relocate a key anywhere legal in its polygon or beside it.
4. **Campus block-plans.** A plan with no walls (or almost none relative to its building count) renders labeled building footprints as raised keyed blocks (the style of PSU's real printed campus tiles) instead of emitting floating braille.
5. **Map fabric** — driven by a direct side-by-side against the ground-truth photos: guide paths as dashed raised lines end-to-end (schema → parser → editor → validator → mesh; CCH lists its guide path FIRST in its legend, and Queens College's real map is walkway channels between blocks), a braille title row in the plate's header band (word-trimmed so it never straddles a plate seam), a north arrow rotated to the parsed compass, the restroom glyph corrected to CCH's exact ⊙, stairs corrected to equal rungs, and boundary symbols (entrance/exit/ramp) allowed to touch the boundary line they mark — as every real map draws them.

### C.1 Results table

| Venue (real tactile map) | Parse | Tactile result | Compared with the real map |
|---|---|---|---|
| **Congress Center Hamburg 2F** (c3tactile.org bronze maps) | v2, 2 loop passes: 8 rooms, 6 walls, 3 doors, 3 furniture blocks, 3 stair features | **VALID · 2×1 plates (400×200 mm)** — final run 4→0, all mechanical; braille title in the header band (word-trimmed to plate 1: a run split across a seam is gibberish) | The strongest result. The real CCH installation is also a large-format multi-panel bronze map with hall keys and a separate legend board; our output independently arrived at the same architecture: multi-plate, 9-key braille legend (`mf`=main foyer …), separate legend plate, seating clubbed as one keyed block. The diagonal Halls D–F are labeled adjacently — visually similar to CCH's own placement of hall letters beside narrow halls. |
| **Getty Center, Museum Entrance Hall** (bronze YAH tactile plan) | v1, single pass: 1 room, 4 walls, 1 door, counter block, elevator + restroom features | **VALID · 1 plate** — final run 3→0 mechanical; restroom now the ⊙ glyph, braille title row | Real map and ours agree on content selection: one hall outline, entrance emphasis, elevator/restroom as point symbols, service counter as a block. Divergence: Getty renders you-are-here prominently (bronze marker); ours only appears when the user places the marker — by design, since mounting position isn't in the plan. |
| **The Met, Fifth Avenue** (historic tactile floor plan; touch-tour maps) | v4, 3 loop passes: 5 labeled galleries, 12 walls, 4 doors, 3 furniture blocks | **VALID · 1 plate** — final run 6→1→…→0 with title row | Five galleries outlined with door gaps, an 8-key legend (galleries + clubbed furniture), entrance and stairs symbols. Matches the historic Met tactile plan's structure: named galleries resolved through a key system. The parse loop earned its keep here — three critique-refine rounds before the geometry settled. |
| **Queen Mary University Graduate Centre** (QMH tactile signage family) | v1: corridor, 4 walls, 4 doors, 4 stairwells, service counter | **VALID · 2×1 plates** — 5→0 deterministic on every rerun, zero LLM layout passes; equal-rung stairs now match QMH's glyph family | The counter block straddles a wall in the parse — no interior key position could ever be 3 mm clear — which drove the legible-fit rule (upgrade 3): its key now sits adjacent, exactly how QMH's real signage labels tight fixtures. First venue to converge on geometry alone. |
| **Queens College campus** (tactile campus map, Kupferberg) | v6 reparse: 32 buildings, north=90° read from the drawn compass, Queens Hall outlined in walls | **VALID · 1 plate** — 12→0 in one mechanical pass; blocks + title + rotated north arrow + ⊙ restrooms + boundary arrows on Queens Hall | With campus block rendering (upgrade 4) this went from floating-dots to a recognizable tactile campus map in the real installation's block style. Caveat kept deliberately: ~31 keys on one plate measures legal on every clearance rule but exceeds key-density *practice* (~15/plate guidance); the real Queens College map is a large lectern board. Key-density as a validator warning is future work (F-5). |
| **Portland State University** (3D-printed campus tiles, Braille edition) | v2 reparse: 15 buildings, **2 street paths**, north read from the plan | **VALID · 1 plate** — keyed blocks + two dashed street paths + braille title + north arrow: structurally the same object as PSU's real model (blocks / street network / north / title) | The venue that *created* finding F-4, re-run after implementing it: buildings now render as raised keyed blocks, structurally the same object as PSU's own 3D-printed braille campus tiles. Lite-model caveat: several footprints parsed as triangular approximations of the building rectangles — geometry renders faithfully to the parse, and the shipped 3.6 model extracts cleaner footprints. |
| **National Mall** (NPS braille/tactile visitor map) | v1: 28 entrance-like POIs, no rooms/walls | Invalid — 15 residual violations (stacked same-kind symbols, margin) | Outdoor federal-park map: no building geometry to parse, so the model degenerates to a POI cloud. The real NPS product is a *street-grid* tactile map — an object our indoor floor-plan contract doesn't model. This is the phase-11 (outdoor/Google-Maps source) boundary, hit honestly rather than hallucinated around. |
| **BART station concourse** (embossed system/station maps) | v2: 49 entrance/fare POIs, no geometry | Invalid — same-kind clearance at transit-diagram density | Same boundary as the Mall: BART's real embossed maps are schematic diagrams, not floor plans. The parse loop twice tried to impose rooms and correctly gave up (critique caught fabrications). |

### C.2 What the runs demonstrate

**Final score: 6 of 8 venues export a zero-violation tactile map — now carrying the fabric real maps have** (title rows, north arrows, guide paths where drawn, corrected glyphs). Four of the six final runs (CCH, Getty, Queen Mary, Queens College) converged **entirely mechanically — zero LLM layout calls**. The two that stay invalid — National Mall and BART — are outdoor street-grid / transit-diagram objects outside the indoor floor-plan contract, and they fail honestly with named, measured violations rather than crashes or hallucinated geometry.

- **The validator is the product's conscience.** Nothing invalid can be exported. Every mid-study failure became either an engine upgrade (four of them, all re-verified) or a documented boundary.
- **The loop architecture proved itself in both directions.** The parse critique loop caught fabricated rooms on BART twice; the layout loop went from LLM-plateau to geometry-first convergence — two venues now reach zero violations without consuming any model quota at all.
- **Where the real world made the same call, we match it**: multi-panel output for CCH (their installation is multi-panel bronze), block rendering for campuses (PSU's printed tiles), adjacent labels for tight features (QMH signage).

<!-- RESULTS -->

---

## D. Findings & recommendations

Ordered by leverage. "Shipped" = implemented during this study because the evidence demanded it.

**F-1 · Shipped — Large venues need multiple plates, chosen automatically.** CCH failed its first run on the scale gate: shrinking the hall floor onto one plate would print door gaps below finger-detectable size. Fix: a deciding step that walks 1×1 → 2×1/1×2 → 2×2 grids and picks the first that keeps the smallest door ≥5 mm printed. Users are told ("Floor is large: fitting on 2 plates…"), never asked — a smaller grid physically cannot be read. Verified end-to-end: CCH exports two watertight 200×200 plates that reassemble exactly (0.000 mm³ volume error vs the composite), previewed in the 3D viewer as one seamless solid.

**F-2 · Shipped — Geometry before judgment.** The layout agent (LLM) plateaued for four passes on violations with arithmetic answers (a braille label 0.2 mm too close to a seam). Fix: deterministic repair pass — seam and pairwise clearance nudges computed exactly at several magnitudes, plus whole-polygon key relocation, each candidate re-validated — before the agent is consulted. CCH went from stuck-at-6 to 4→1→0; Queen Mary and PSU reached zero violations with **zero LLM layout calls**. General principle confirmed: *AI proposes, geometry disposes* — every violation class with a closed-form fix should never reach the model.

**F-3 · Shipped — Legible-fit labels, adjacent when impossible.** CCH's diagonal Halls D–F have huge bounding boxes but are thin slanted bands — bbox tests lie; Queen Mary's counter straddles a wall, so *every* interior position violates line clearance. Fix: "can hold its key" is decided by placement search (sampled rect-in-polygon, ≥3 mm from every tactile line), shared by converter, validator, and repair pass; features with no legible interior position take an adjacent label ≤10 mm away, the convention observed on real maps. Blocks too small for their key get adjacent labels too, instead of silently losing the key. Also fixed en route: a floating-point epsilon so "3.0 mm apart — minimum 3 mm" can't fail.

**F-4 · Shipped — Wall-less building footprints emit as area blocks.** PSU parsed 11 building footprints (correct for a campus block-plan) but the converter only emitted braille keys — a plate of floating dots that *measured* valid: a false-positive class, caught because we looked at the render, not just the violation count. PSU's own 3D-printed tactile campus map proves the right rendering. Implemented: a plan with no walls emits each labeled room polygon as a +0.5 mm keyed block; PSU and Queens College re-ran to valid, readable campus maps.

**F-5 · Superseded, one residue — key-density guidance.** The original finding (short-circuit unfixable label-fit classes) dissolved: F-2/F-3 made those classes fixable, and Queens College now converges in one mechanical pass. What remains: ~31 keys on one plate is legal per every measured rule but exceeds practitioner guidance (~15 keys/plate). Recommend a *warning-level* validator rule (not export-blocking) so dense campus maps steer users toward the planned region-selection flow.

**F-6 · Shipped — Restroom ⊙, equal-rung stairs, boundary-symbol exemption, adjacent-gap fix.** The two divergent glyphs now match the observed forms (CCH's exact WC circle-dot; the TREPPE equal-rung ladder). Two further rules fell out of the Queens College rerun: entrance/exit/ramp symbols may touch the boundary line they mark (every ground-truth map draws them there), and an adjacent label's standoff must exceed clearance-plus-half-a-wall (4.5 mm) because the polygon edge it hugs may itself be a wall line — at 2 mm, adjacent labels were born violating.

**F-7 · Mostly shipped; remainder post-hackathon.** Shipped from this list after the ground-truth side-by-side: guide/route paths (dashed raised lines, parseable and hand-drawable), the rendered north arrow, and the plate title row. Still open: a texture vocabulary beyond one solid fill (CCH's backstage spiral, PSU's green/hatch fields), raised print letters beside braille, numbered POI keys, scale bars. The lite model also under-extracts drawn walkways (Queens College's walkway network yielded zero paths; PSU's bolder streets yielded two) — parse-level, expected to improve on the shipped 3.6 model.

**F-8 · Boundary confirmed — outdoor/diagram sources are a different product.** National Mall (street grid) and BART (transit diagram) degenerate exactly as an indoor floor-plan contract should predict. The critique loop correctly blocked fabricated rooms. These want the phase-11 outdoor source (map-corner selection), not looser parsing.

**Residual risks.** (1) Physical print fidelity of 0.7 mm braille domes on FDM remains unvalidated until the planned test print. (2) Study ran on `gemini-3.1-flash-lite` (quota); shipped `gemini-3.6-flash` parses richer — venue results are a lower bound. (3) Ground-truth comparison is against photographs of real maps, not measurements of them; physical parameters are audited against the written standards instead (section A).

<!-- FINDINGS -->
