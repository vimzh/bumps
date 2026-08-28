# Phase 11 — Google Maps as a second source (outdoor areas)

**Goal:** tactile maps of real-world outdoor areas — parks, campuses, plazas — for governments and public institutions, without needing a floor plan file at all.

**Depends on:** Phases 1–9 shipped (this reuses the whole pipeline). Post-submission stretch — do not start before Phase 10 is done.

## Work

- The landing hero's upload control becomes a split/dropdown button with two sources: **File** (current flow, unchanged) and **Google Maps**.
- Google Maps flow: an embedded map (Google Maps JavaScript API + Places search) lets the user search for an area, then **mark 4 points** to bound the region they want. The quad defines the map extent.
- Area capture: fetch a clean top-down rendering of the bounded area (Maps Static API, styled to strip labels/POI clutter) plus whatever vector context the Maps Platform offers, and feed it through the **same pipeline** — ParserAgent reads paths, roads, water, buildings, and entrances instead of walls and rooms; then edit canvas → tactile conversion → STL, unchanged.
- Outdoor symbol vocabulary: extend the v1 set (path, road crossing, water, building outline, entrance, "you are here") — BANA-consistent, added to the legend like everything else.
- Same plate, same standards, same legibility gate: a park that doesn't fit 200 × 200 at readable scale fails loudly with "area too large — mark a smaller region."

## Why it fits

- The pipeline was designed source-agnostic: everything downstream of the floor-model JSON doesn't care whether the model came from a PDF or a satellite quad.
- Touch Mapper proved outdoor tactile maps from map data work (using OpenStreetMap); doing it on Google Maps Platform deepens the hackathon's Google-stack story.
- Target users shift from building owners to governments and park authorities — a second market with procurement budgets.

## Done when

Searching an area, marking 4 points, and clicking through the wizard yields a printable STL of that area with readable paths and a legend — using the same edit and validation stages as the file flow.
