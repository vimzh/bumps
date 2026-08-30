# bumps compliance & validation report

**Current status (2026-08-30):** corpus v2 contains 30 unique real-plan/real-tactile-reference pairs and all 30 asset pairs are prepared. Seven venues have been attempted with Gemini only. Three produced a complete, self-consistent three-image comparison; four stopped at a named model/network failure. This is a meaningful baseline, not a completed 30-run study.

The three comparison scores are diagnostic rather than ground truth. V&A is the strongest exact-scope pair. The Harris judge inferred tactile texture from color, and Camille compares a sensory-tour source with a general orientation board, so those two scores are explicitly provisional. Kwun Chung's earlier comparison was removed because a tighter-crop rerun overwrote its result without preserving a matching input fingerprint; it is not counted as evidence.

Two metric families remain separate:

- **A. Physical specification conformance** — deterministic geometry checked against written standards and the validator.
- **B. Representational fidelity** — observed conventions from installed tactile maps.
- **C. Corpus v2 live evidence** — actual plan → parse → critique → tactile layout → render → real-map comparison results.

---

## A. Physical specification conformance (deterministic audit)

Every value below is a constant in `packages/floor-model` and enforced by the validator (`validate.ts`); export is blocked at any violation. Audit method: code inspection + the validator's own test suite (30 tests passing).

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

## C. Current corpus v2 live evidence

### C.1 Coverage and outcomes

| Venue | Scope quality | End-to-end outcome | Comparison | Evidence-backed finding |
|---|---|---|---|---|
| V&A East Gallery 1 | Exact gallery plan and production tactile design | Valid 1×1; rerun improved deterministic convergence from 2→1→0 to 2→0 | 7.7/10, confidence 0.95, exploratory Flash Lite judge | Geometry is recognizable, but the real dashed guide route, YAH marker, and tactile-display symbols are absent. |
| The Harris | Same building; installed board is rotated relative to the public plan | Valid 1×1; 18→4→1→0 | 7.3/10, confidence 0.9, provisional | Geometry is strong; orientation and YAH differ. The judge's claim that color proves tactile texture is unsupported, so the score is not acceptance evidence. |
| Musée Camille Claudel | Same museum, but sensory-tour source versus general orientation board | Valid 2×1 plus two paginated legend plates; 36→0 deterministically after dropping seven sub-5 mm furniture blocks | 4.0/10, confidence 0.5, exploratory Flash Lite judge | Mechanical validity improved substantially, but omitted levels, the purpose mismatch, and sparse two-plate composition limit realism. |
| Kwun Chung Sports Centre 5/F | Exact venue and floor | Tighter-crop rerun rejected at critique; stale earlier output removed | No current score | The failed critic returned schema-invalid JSON. A clean rerun is required. |
| Osman Ramju Sadick Memorial Sports Centre G/F | Exact venue and floor | One run reached layout and timed out; the post-prompt rerun exhausted the 3.5 quota during parsing | No score | The first attempt exposed Wi-Fi hotspots being retained as info-points. Parser/critic prompts now reject that class, but no post-prompt output was accepted. |
| Laing Art Gallery | Prepared | Parser connection wrapper failure | No score | Retry classification now recognizes the wrapper as transient. |
| Woodhorn Museum | Prepared | Parser connection wrapper failure | No score | Retry classification now recognizes the wrapper as transient. |

Prepared but not yet attempted: 23 cases. All 30 assets pass `bun scripts/run-corpus.ts validate`.

### C.2 Gemini role observations

| Configuration | Observed result | Decision |
|---|---|---|
| Gemini 3.6 Flash, Interactions API | Best critical parser/critic behavior seen; completed V&A and produced the now-superseded Kwun attempt | Keep as the default critical model, but its free 20-request daily quota is exhausted. |
| Gemini 3.5 Flash, legacy endpoint | Parser works after removing unsupported `exclusiveMinimum`; layout can time out | Viable schema-enforced parser fallback, not a reliable layout default from this sample. |
| Gemini 3.5 Flash Lite | Fast comparison, weaker schema/instruction adherence | Use only for exploratory scoring; never treat its score as a release gate. |
| Gemini 3.7 Flash | Quota exhaustion and repeated structured-output retries | No demonstrated advantage in this run. |
| Gemini 2.5 Flash | Hard 404: unavailable to new users | Not usable. |

### C.3 Shared changes driven by the corpus

1. Renderer and STL export now use one shared braille-row paginator and emit as many separate legend plates as required; dense legends can no longer be clipped or extend beyond the printable base.
2. The runner clears prior generated stage artifacts before a non-resumed run, preventing a failed rerun from inheriting an older comparison or render.
3. The runner persists project, model history, tactile design, comparison, failures, and per-stage model/endpoint provenance. Model provenance is read from the API process for parse/critique/layout and from the runner for comparison.
4. Legacy Gemini response schemas no longer emit `exclusiveMinimum` for road widths.
5. Transient Gemini connection wrappers and mixed-case invalid-JSON errors are classified correctly for retry.
6. Mechanical repair now covers all initial elements instead of stopping after 12 attempts, samples more legal label positions, repairs plate margins, and can accept a same-count move when it removes the targeted conflict.
7. Furniture smaller than the 5 mm tactile discrimination floor is removed with an observable conversion note.
8. Parser and critic instructions now reject non-navigation technology/operations markers such as Wi-Fi hotspots and define info-points as staffed visitor information/reception only.
9. Comparison gaps are schema-enforced as source-and-real, real-only, or source-only; the prompt also prohibits inferring tactile properties from color and caps confidence when scope is uncertain.

### C.4 Remaining quality gaps

- Texture metadata is currently inert: producers emit only solid areas and neither preview nor mesh implements dot/line textures. Adding patterns before semantic texture assignment exists would create decorative, ungrounded output, so it remains unshipped.
- Numbered POI systems, raised print alongside braille, scale indication, and stronger YAH/orientation treatment remain below installed-map practice.
- Semantic reduction is still primarily parser-guided. Osman shows why a separately evaluated accessibility-selection stage may be the next high-leverage architecture change once enough Gemini quota exists to test it.
- Physical FDM validation of braille domes and relief separation has not been performed.
- The remaining 23 prepared cases and all failed cases need clean reruns before the 30-case study can be called complete.

---

## Appendix A. Superseded v1 live runs

Method: each venue's real **visual** plan (see SOURCES.md) was uploaded through the production pipeline (upload → parse loop → tactile conversion → validator/layout loop → render). Outputs in `outputs/<slug>-{input,ours}.png`, project ids in `outputs/<slug>.project`.

**Model config:** runs used `gemini-3.1-flash-lite` via the GA Interactions API. The shipped default is `gemini-3.6-flash`, whose free-tier daily budget was exhausted across four keys by the time the batch ran (an attempted 3.6 run 429'd on every venue). Prior same-day comparisons on identical inputs showed 3.6 converging in 1–2 layout passes where lite needed 3–4, and richer extraction — so parse quality below is a **lower bound** on shipped behavior. The deterministic stages (conversion, validation, mesh) are model-independent.

Four engine upgrades landed mid-study *because of* study results, and every affected venue was re-run on the updated engine:

1. **Multi-plate deciding step.** Venues whose door openings would print under the 5 mm legibility gate on one 200×200 mm plate are now automatically fit on a 2×1 / 1×2 / 2×2 plate grid (smallest grid that restores legibility). The STL engine slices one print file per plate from a single composite solid — verified watertight, and the per-plate volumes sum to the composite volume with 0.000 mm³ error — so assembled seams align exactly. A seam-clearance rule keeps braille and point symbols ≥3 mm from plate joints (a split braille cell is gibberish).
2. **Deterministic placement & repair.** Braille keys are placed by geometric search; seam/clearance violations with an arithmetic answer are fixed by code (exact nudges, multiple magnitudes, full re-validation per candidate) before the layout agent is consulted. The LLM only sees residual trade-offs.
3. **Legible-fit labels.** "The key fits inside" now means a position exists that is inside the polygon *and* ≥3 mm from every tactile line. Features with no legible interior position (thin diagonal sliver halls; a counter straddling a wall) take an adjacent label ≤10 mm away — the convention on real tactile maps — and the repair pass can relocate a key anywhere legal in its polygon or beside it.
4. **Campus block-plans.** A plan with no walls (or almost none relative to its building count) renders labeled building footprints as raised keyed blocks (the style of PSU's real printed campus tiles) instead of emitting floating braille.
5. **Map fabric** — driven by a direct side-by-side against the ground-truth photos: guide paths as dashed raised lines end-to-end (schema → parser → editor → validator → mesh; CCH lists its guide path FIRST in its legend, and Queens College's real map is walkway channels between blocks), a braille title row in the plate's header band (word-trimmed so it never straddles a plate seam), a north arrow rotated to the parsed compass, the restroom glyph corrected to CCH's exact ⊙, stairs corrected to equal rungs, and boundary symbols (entrance/exit/ramp) allowed to touch the boundary line they mark — as every real map draws them.

### Appendix A.1 Results table

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

### Appendix A.2 What the runs demonstrate

**Final score: 6 of 8 venues export a zero-violation tactile map — now carrying the fabric real maps have** (title rows, north arrows, guide paths where drawn, corrected glyphs). Four of the six final runs (CCH, Getty, Queen Mary, Queens College) converged **entirely mechanically — zero LLM layout calls**. The two that stay invalid — National Mall and BART — are outdoor street-grid / transit-diagram objects outside the indoor floor-plan contract, and they fail honestly with named, measured violations rather than crashes or hallucinated geometry.

- **The validator is the product's conscience.** Nothing invalid can be exported. Every mid-study failure became either an engine upgrade (four of them, all re-verified) or a documented boundary.
- **The loop architecture proved itself in both directions.** The parse critique loop caught fabricated rooms on BART twice; the layout loop went from LLM-plateau to geometry-first convergence — two venues now reach zero violations without consuming any model quota at all.
- **Where the real world made the same call, we match it**: multi-panel output for CCH (their installation is multi-panel bronze), block rendering for campuses (PSU's printed tiles), adjacent labels for tight features (QMH signage).

<!-- RESULTS -->

---

## Appendix B. Superseded v1 findings & recommendations

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
