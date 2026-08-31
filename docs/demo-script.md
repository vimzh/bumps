Hi, this is bumps! It turns weeks of expensive tactile-map design into a process that takes minutes.

A blind or low-vision visitor can enter a building without knowing where the rooms, stairs, or exits are. Public buildings, libraries, stores, railway stations, and museums must be accessible. Yet many still do not have a tactile map.

A tactile map gives the visitor the building through touch before the first step.

Today, a specialist must interpret each plan, simplify it, add braille, and check every detail. This work is slow and expensive. bumps automates it for a standard 3D printer.

Four Gemini agents help with the design. The system uses two iteration loops to find and correct errors.

In the first loop, the parser extracts walls, rooms, doors, and labels. The critic compares this result with the source image. The parser then corrects each error that the critic finds.

Every map element gets a confidence score from zero to one. The loop continues until the review passes or the total confidence reaches its target.

Low-confidence elements are easy to find, and you can edit any map element. Move, add, delete, rename, or confirm it directly. You can also describe a change in plain language. The edit engine converts it into controlled operations with valid element IDs.

Next, bumps selects the plate layout automatically. Each 200-by-200-millimeter plate fits common consumer 3D printers. The system selects the smallest readable grid, from one plate up to a 4-by-4 grid. It never shrinks tactile features below a readable size.

We follow the BANA 2022 tactile-graphics guidelines and ADA Section 703. The system uses Grade 1 UEB braille with exact ADA dot size and spacing.

The title appears in braille. Rooms use short braille keys, and the system creates the full braille legend automatically. It also includes the “you are here” marker.

The validator checks plate margins, braille geometry, symbol sizes, wall heights, and spacing between tactile elements. It also checks doors, corridors, labels, and plate seams for readability.

In the second loop, an agent adjusts labels and symbols. The validator measures the complete tactile layout after each change.

The loop must reach zero violations. If any violation remains, the app blocks export and shows the exact problem. We never export a map that fails these checks.

The agents make the decisions. The geometry engine enforces the rules.

Finally, bumps creates a watertight STL file. A standard 3D printer can print each plate flat without supports. Large maps use multiple plates that join into one readable map.

This live backend runs on Google Cloud Run. Its logs show Gemini 3.7 Flash calls through Vertex AI and Google’s Agent Development Kit. A private Cloud SQL database stores the project data.

bumps turns an existing floor plan into a printable tactile map in minutes. People can review the complete result and trust every measured feature.
