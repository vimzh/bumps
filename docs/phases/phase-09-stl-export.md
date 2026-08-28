# Phase 9 — STL generation & export

**Goal:** validated tactile design → watertight, printable STL the user downloads.

**Depends on:** Phase 8 (only exports zero-violation designs).

## Work

- Extrusion: 2D polygon layers → prisms at their z-heights on the 3 mm base; braille dots as spherical-cap domes (+0.7 mm).
- Union everything with manifold-3d (WASM) → single watertight manifold; binary STL writer.
- Legend plate exported as a second STL when the legend doesn't fit on-plate.
- Wizard Export step: three.js preview of the actual mesh, download button(s), print-settings hint (0.4 mm nozzle, ≤ 0.2 mm layers, flat on bed, no supports).
- Sanity checks in code: mesh is manifold, fits 200×200×~8 mm bounding box, min feature ≥ printable width. **Do one real test print** — braille legibility on FDM is the whole product.

## Done when

The end-to-end flow (upload → … → Export) yields an STL that slicers accept without repair, and a physical test print has readable braille and distinguishable symbols by touch.
