# LinkedIn post

I built something I wish more buildings already had.

When a sighted person enters an unfamiliar hospital, school, museum, or office, they can glance at a floor plan and understand the space in seconds.

For someone who is blind or visually impaired, that picture is often missing.

Tactile maps can provide it through touch. But creating one usually requires specialist knowledge, significant expense, and weeks of manual work. Many organizations want to make their spaces more accessible, but the process itself puts it out of reach.

That stayed with me, so I built **bumps — maps you can feel**.

bumps turns a regular floor plan into a standards-validated, 3D-printable tactile map in minutes. Multiple Gemini agents extract the layout, review one another's work, and help the user correct it. Deterministic code then checks the design against the tactile-graphics rules encoded from BANA 2022 and ADA §703 before generating a watertight STL with braille and a tactile legend.

I built the entire project solo using Gemini 3.7 Flash, Google ADK, TypeScript, Next.js, Bun, Three.js, PostgreSQL, Vercel, Render, and Google Cloud Run.

The part I am proudest of is not the AI or the 3D model. It is the possibility that accessibility could stop being an expensive custom project and become something a school, library, hospital, or small organization can actually create.

There is still more to do, especially testing physical prints with blind and visually impaired users. But this feels like a meaningful first step.

Demo: [add link]

#AllThingsAgentic #GoogleAI #Gemini #Accessibility #BuildInPublic
