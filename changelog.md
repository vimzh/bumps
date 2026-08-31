# bumps improvement changelog

This is the build story of bumps, from a one-pass floor-plan parser to a web app that produces reviewed, standards-checked, 3D-printable tactile maps.

We are removing the friction that keeps government buildings, public venues, and businesses from providing tactile maps for blind and low-vision visitors. Today, creating one usually means paying for a custom commission and waiting weeks for a specialist to model the space. bumps turns that process into a workflow that takes minutes: upload a floor plan, review the extracted layout, and receive a clear, 3D-printable STL. The goal is to make accessibility practical enough that more organizations can offer it in the places people use every day.

## How to read this changelog

Each entry answers four questions:

1. What did we try?
2. Why did we try it?
3. What evidence did we get?
4. What did we keep, revise, or remove?

Commit references point to the repository history. The evidence comes from the automated tests, the eight-venue v1 study, the 30-pair v2 corpus, and focused before-and-after runs documented in [pipeline_tests/REPORT.md](pipeline_tests/REPORT.md).

The progression was linear at first. A plan went into one parser, the result moved forward, and mistakes moved forward with it. We then added a review agent and changed parsing into a loop: parse, render, compare, revise, and repeat. That was much better, but it was still not perfect. Small doors, missing gates, messy source images, and confident-looking mistakes survived. Each later iteration came from one of those concrete failures.

## Baseline: build the first linear pipeline

**What we tried and why:** We introduced a structured floor-model contract and a Gemini parser agent. The first parsing stage was a straight line: send the image to the parser, accept one response, and save the extracted geometry for the later edit, tactile, and export stages. Instead of asking the model to draw the final object, the parser emitted typed walls, openings, rooms, features, furniture, and confidence values.

**Evidence:** The pipeline produced versioned, editable geometry rather than an untraceable image or block of prose. It worked on simple plans, but one bad parse could contaminate every later step. Missing walls, invented rooms, and misplaced doors still looked legitimate because nothing compared the extraction with the source before moving on.

**Decision and learning:** Keep the shared contract and version history, but stop treating one parser response as the answer. The pipeline needed a second agent whose job was to challenge the first result.

**Commit:** `b971489`.

## Iteration 1: add a review agent and turn parsing into a loop

**What we tried and why:** We added a critic that receives the original plan and a fresh rendering of the extracted model. It reports typed findings, sends them back to the parser, and repeats until the comparison passes or the iteration limit is reached. Every element also carries a confidence score.

**Evidence:** The review loop found major geometry errors that the first pass had accepted and corrected them before the user reached the editor. It also made uncertainty visible. The result was clearly better than the linear one-pass flow, but later venue tests showed that small openings, perimeter gates, and cluttered plans could still escape review.

**Decision and learning:** Keep the parse, render, critique, and revise loop. Do not call it perfect. Use confidence to route uncertain elements to a person, and keep testing the loop on harder plans.

**Commit:** `b971489`.

## Iteration 2: put a person back in control

**What we tried and why:** We added a full-viewport edit canvas and an edit agent. Users could move, resize, delete, and relabel extracted elements directly, or describe a change in plain language. The agent could return only typed operations against real element IDs.

**Evidence:** Parsed geometry stopped being an all-or-nothing model answer. Every accepted edit remained visible and reversible through model versions. Invalid references and ambiguous requests could be rejected instead of becoming hidden geometry changes.

**Decision and learning:** Keep both direct manipulation and prompt editing. Keep raw geometry generation outside the edit agent. Human review is a product feature here, not an admission that the agent failed.

**Commit:** `d25ab6c`.

## Iteration 3: make tactile design deterministic

**What we tried and why:** We built a conversion engine that turns the reviewed floor model into raised walls, door gaps, tactile symbols, braille keys, and a legend. Exact braille geometry lives in shared code rather than in prompts.

**Evidence:** The same input now produced repeatable millimeter-based geometry. Braille dimensions, relief layers, symbol sizes, and clearances could be inspected and tested without another model call.

**Decision and learning:** Keep deterministic conversion. Remove any idea that an agent should be trusted to choose physical measurements from scratch. Language models are useful for perception and judgment, not for being a ruler.

**Commit:** `f62fcec`.

## Iteration 4: block bad output instead of describing it as good

**What we tried and why:** We added a standards validator and a layout loop. The validator reports measured violations with element IDs. Mechanical fixes and a tightly constrained layout agent can move labels and symbols, but export remains locked until the count reaches zero.

**Evidence:** Tests covered symbol size, margins, scale, label fit, and pairwise clearance. Impossible designs failed with named violations instead of producing a file. Later real-venue runs showed the violation count falling to zero on printable cases.

**Decision and learning:** Keep zero violations as a hard gate. Never turn compliance failures into warnings just to finish the demo.

**Commit:** `4b3abf8`.

## Iteration 5: harden the pipeline against real-plan failures

**What we tried and why:** We stopped relying on isolated fixtures and ran real plans through the complete workflow. Those runs drove changes to furniture classification, door gaps, retries, and model error handling.

**Evidence:** Real plans exposed failures that unit fixtures did not: furniture was mistaken for structure, doors did not always create wall gaps, and model errors arrived through event streams instead of the exception path the pipeline expected.

**Decision and learning:** Keep guarded retries and explicit model failures. Remove the assumption that valid JSON means the extracted map is valid or useful.

**Commit:** `0b6e460`.

## Iteration 6: stop shrinking large buildings until they become unreadable

**What we tried and why:** The first converter assumed every map should fit one plate. Large venues showed that this made door gaps and labels physically unreadable, so we added an automatic deciding step for 1 x 1, 2 x 1, 1 x 2, and 2 x 2 plate grids.

**Evidence:** Congress Center Hamburg moved from failing the scale gate to a valid two-plate design. Sliced plate volumes summed to the composite volume with 0.000 mm3 difference, and seam rules prevented braille or symbols from being split across joints.

**Decision and learning:** Remove the single-plate assumption. Keep the smallest grid that preserves tactile legibility. A file that fits the printer but cannot be read by a finger is not a successful export.

**Commit:** `77200e7`.

## Iteration 7: let real venues break the clever parts

**What we tried and why:** We ran the first structured study on eight real venues and compared our output with real tactile maps. The primary outcome was whether a venue reached a zero-violation export. We also inspected whether the result carried the same map structure and tactile conventions as the installed reference.

**Evidence:** Six of eight venues exported valid maps. Four of those six reached zero violations entirely through mechanical repair, with no layout-agent call. National Mall and BART remained invalid because they were outdoor or transit-diagram sources outside the indoor floor-plan contract. They failed with named violations instead of fabricated rooms.

**Decision and learning:** Keep the honest boundary. Remove the idea that one permissive parser should handle floor plans, street maps, and transit diagrams. The study also showed that deterministic repair was more reliable and cheaper than asking an agent to solve arithmetic spacing problems.

**Commit:** `4116581`.

## Iteration 8: compare against real tactile-map fabric, not only a rules table

**What we tried and why:** Side-by-side review against installed tactile maps showed that a technically valid plate could still feel unlike a useful map. We added guide paths, map titles, north indicators, equal-rung stairs, a real-world restroom glyph, boundary symbol rules, and keyed building blocks for campus plans.

**Evidence:** Portland State changed from floating braille dots into keyed building blocks connected by raised paths. Congress Center Hamburg independently arrived at the same multi-panel and separate-legend pattern used by its real installation. The Met required three critique rounds before its geometry settled.

**Decision and learning:** Keep the features that repeated across real artifacts. Remove the self-invented restroom symbol and tapered stair bars. Do not add decorative textures until the source gives them a grounded meaning.

**Commit:** `b57c4e0`.

## Iteration 9: replace the small study with a reproducible corpus

**What we tried and why:** We built a versioned 30-pair corpus of real source plans and tactile references, a runner for upload through comparison, stage-level provenance, cached artifacts, and schema-checked comparison results. We also tried several Gemini versions and endpoints.

**Evidence:** All 30 pairs passed corpus preparation. Seven live cases were attempted in the first v2 round. Three completed a self-consistent three-image comparison and four stopped at named model or network failures. One stale comparison was removed when its input fingerprint no longer matched. Gemini 3.6 Flash gave the strongest critical parsing observed. Gemini 3.5 Flash Lite was fast but weaker at schemas. Gemini 2.5 Flash returned a hard 404 for new users.

**Decision and learning:** Keep the corpus, provenance, fingerprints, and explicit failed runs. Remove stale evidence and stop treating an exploratory model score as a release gate. A partial study with honest failures is more useful than a clean table built from mismatched artifacts.

**Commit:** `04332d5`.

## Iteration 10: make the parser look where it usually fails

**What we tried and why:** We overhauled parsing with detail crops, wall-junction welding, opening snapping, duplicate removal, sealed-room and orphan-opening checks, door-gap analysis, pixel coverage, and a structural audit fed back to the critic as hints. We then added a dedicated openings auditor for doors and entrance gates.

**Evidence:** On The Harris, the new pipeline traced 44 walls, 11 openings, and 13 rooms compared with 34, 13, and 12 before. It connected areas that previously floated or overlapped and surfaced six low-confidence elements instead of reporting false certainty. A later door-focused run moved one door, deleted three invented doors, and added three missing street gates. The tactile result went from 28 violations to 0. Kwun Chung, which had previously failed during critique, completed end to end with 68 walls, 15 openings, 13 rooms, 8 features, and a valid 2 x 1 plate grid.

**Decision and learning:** Keep deterministic audits as attention guides, not as claimed truth. The critic still has to verify every hint against the image. Keep the one-call opening audit because doors are small, consequential, and repeatedly weak.

**Commit:** `e2d9d87`.

## Iteration 11: reduce cost without hiding uncertainty

**What we tried and why:** The stricter parser improved structure but used about twice as many calls on The Harris. We cut the maximum critique loop from five rounds to three, reduced image payloads, capped finding crops and output tokens, logged spend, and added a guarded accept-with-warnings path for useful drafts that still had a small number of major findings.

**Evidence:** V&A completed in 62 seconds and exactly three model calls: parse, one passing critique, and the door audit. Its curved wall, closed shell, and 12 display blocks improved over the archived result. CCH's isometric marketing render was rejected as not a floor plan. Met and Queen Mary produced much richer drafts than the old pipeline, but their unresolved items were placed into the human review queue instead of being called finished.

**Decision and learning:** Keep bounded, observable degradation. A high-confidence draft with a few named problems can be useful when a person must review it. Low confidence or widespread major findings still fail. Remove unlimited retries and silent billable retries.

**Commit:** `e2d9d87`.

## Iteration 12: fix the last failures with code before spending another model call

**What we tried and why:** Real runs exposed nested braille collisions, labels with no escape path, service failures during a loop, and a final set of precise Harris geometry issues. We expanded deterministic placement search, allowed repair sweeps, salvaged the last reviewed model after provider failure, and used pixel scans for exact wall runs and gap centers.

**Evidence:** All eight accepted session models reached zero violations mechanically in under one second each. The full suite at that point had 95 passing tests. The final Harris corrections required zero model calls and revalidated from 12 violations to 0.

**Decision and learning:** Keep geometry in code whenever the answer can be measured. The shortest reliable agent call is the one the program no longer needs.

**Commit:** `e2d9d87`.

## Baseline and current evidence

The one-pass parser was not preserved as a complete matched benchmark, so we do not invent a score for it. The first repeatable baseline is the eight-venue study:

| Measure | First measured workflow | Current evidence |
|---|---:|---:|
| Zero-violation exports on the same eight v1 venues | 6 of 8 | Not rerun as a complete matched eight-case set |
| Mechanical convergence without a layout-agent call | 4 of 6 valid venues | All 8 accepted session models in the latest hardening round |
| Prepared real plan and tactile-reference pairs | 8 | 30 |
| Uncertainty handling | Confidence flags | Confidence flags, structural hints, input rejection, and an accept-with-warnings review queue |

The current pipeline is clearly more capable, but we do not claim an 8-of-8 improvement on the original study because the final pipeline was not rerun on the exact same eight sources under one unchanged model and endpoint. The strongest current evidence is the same-venue comparison on The Harris, the successful recovery of Kwun Chung, the three-call V&A run, the 30-pair prepared corpus, and the deterministic standards suite.

Human time and model cost were logged during the later experiments, but there is not yet a complete matched baseline-versus-final table for either measure. The honest next evaluation is a clean corpus run with one fixed model, one endpoint, and preserved per-stage timing and cost.

## What we tried and removed

- One-shot parsing as the trusted answer: replaced by render, critique, refine, confidence, and targeted audits.
- Agent-first layout repair: moved behind deterministic repair after it plateaued on arithmetic spacing problems.
- One plate for every building: removed after large venues became physically unreadable.
- A self-invented restroom glyph and tapered stairs: replaced after comparison with installed tactile maps.
- Treating every image as a floor plan: removed after outdoor maps, transit diagrams, and isometric renders exposed fabrication risk.
- Stale or mismatched evaluation artifacts: removed through input fingerprints and clean-run artifact clearing.
- Gemini 2.5 Flash as a usable option: removed after a hard availability failure for new users.
- Gemini 3.5 Flash Lite as a quality judge: retained only for exploratory scoring because its schema and instruction adherence were weaker.
- Decorative tactile textures: not shipped because the source data does not yet assign them a trustworthy meaning.

## Main failure mode

The hardest remaining problem is not STL generation. It is faithful semantic reduction from messy visual plans. Small doors, entrance gates, nested spaces, decorative linework, and non-plan images can all look plausible to a model while being wrong in ways that matter to a blind reader.

The system reduces that risk with visual critique, detail crops, deterministic structural audits, a dedicated opening audit, confidence thresholds, a human review step, and a hard standards gate. It does not eliminate the need for a qualified review or a physical test print.

## Hot take

The most useful agent is not the one that acts most independently. It is the one that knows exactly where its judgment ends.

In bumps, model intelligence improved the result when it interpreted images, compared alternatives, and explained uncertainty. Reliability improved when code handled measurements, topology, repair, and export. The product became usable when we stopped asking the model to be good at everything and made every failure visible to the next person in the loop.
