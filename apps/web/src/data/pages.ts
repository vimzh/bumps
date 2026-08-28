export const pagesContent = {
  howItWorks: {
    steps: [
      {
        description: "A PDF or image of a single floor.",
        title: "Upload a floor plan",
      },
      {
        description:
          "AI reads the walls, doors, rooms, stairs, and elevators — scoring its own confidence and re-checking its work against your plan.",
        title: "It gets parsed",
      },
      {
        description:
          "Review what the AI understood on an editable canvas. Fix things by hand, or just describe the change in words.",
        title: "You confirm",
      },
      {
        description:
          "Rooms become raised shapes, labels become braille, and everything is spaced so fingertips can tell it apart — following tactile-graphics standards throughout.",
        title: "It turns tactile",
      },
      {
        description:
          "Download a 200 × 200 mm STL and print it flat on any consumer 3D printer — no supports needed.",
        title: "You print it",
      },
    ],
    title: "How it works",
  },
  theNeed: {
    paragraphs: [
      "Walking into an unfamiliar building without sight means arriving without the one thing every other visitor gets for free: a picture of the layout. A sighted person glances at the lobby directory. A blind person has to ask, memorize spoken directions, or learn the space by trial and error.",
      "A tactile map closes that gap. Read it once at the entrance with your fingertips and you carry the layout with you — where the corridors lead, where the stairs and elevators are, which door is yours. Research with blind readers has validated 3D-printed floor plans as exactly this kind of tool.",
      "Yet almost no building has one, because every tactile map is a custom commission: a specialist studies the plan, designs to tactile standards, produces the map, and ships it. That is slow and expensive enough that only a handful of institutions ever order one.",
      "The printers are already everywhere — schools, libraries, and makerspaces run them daily. What is missing is the design step, and that is the part bumps automates. A tactile map should cost a floor plan and a spool of filament, not a commission.",
    ],
    title: "The need for this",
  },
  whatItDoes: {
    paragraphs: [
      "bumps turns a floor plan into a tactile map — a raised, touchable model of a building that blind and low-vision people read with their fingertips.",
      "Today these maps are made by hand: a specialist studies the building, designs the layout, produces it, and ships it. It is slow and expensive, so most buildings never get one.",
      "bumps automates the whole pipeline. Upload a plan, review what the AI understood, and download a 3D-printable file with braille labels, standardized tactile symbols, and fingertip-readable spacing.",
    ],
    title: "What it does",
  },
} as const;
