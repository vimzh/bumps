I built something I wish more buildings already had.

A sighted visitor can glance at a floor plan and understand an unfamiliar building in seconds. For someone who is blind or has low vision, that picture is often missing.

Tactile maps provide it through touch, but producing one usually takes specialist knowledge, significant cost, and weeks of manual work.

For the #AllThingsAgentic Hackathon, I built bumps — maps you can feel.

bumps turns an ordinary floor plan into a standards-validated, 3D-printable tactile map in minutes:

- Gemini agents extract walls, rooms, doors, labels, and accessibility features.
- A critic agent compares the extraction with the original plan and drives a bounded correction loop.
- The user can review every element directly or request controlled edits in plain language.
- Deterministic geometry checks the design against rules encoded from BANA 2022 and ADA §703 before generating a watertight STL, braille keys, and a matching tactile legend.

The engineering principle is simple: agents make the decisions; geometry enforces the rules. If a measurable violation remains, export stays blocked.

I built bumps solo with Gemini 3.7 Flash, Google ADK, Vertex AI, Google Cloud Run, TypeScript, Next.js, Bun, Hono, PostgreSQL, and Three.js.

There is more work ahead—especially testing physical prints with blind and low-vision users—but this is a meaningful step toward making tactile wayfinding faster and more accessible to schools, libraries, hospitals, museums, and other public spaces.

Watch the 4-minute demo: https://www.youtube.com/watch?v=Gb_6_sYRsBY

I created this post for the purpose of entering the All Things Agentic Hackathon.

#Gemini #GoogleADK #GoogleCloud #AIAgents #Accessibility #AssistiveTechnology #3DPrinting
