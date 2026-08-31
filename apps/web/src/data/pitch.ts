export const pitchSlides = [
  {
    id: "visitor",
    section: "The missing overview",
    title: "Public buildings must be accessible. Most still have no tactile map.",
    body:
      "Blind and low-vision visitors are asked to navigate unfamiliar spaces without the overview sighted visitors get for free.",
    hero: {
      src: "/pitch-tactile-hero.png",
      alt: "A hand reading a raised tactile floor map",
    },
    details: [
      {
        src: "/gallery/office-plan.png",
        alt: "A simple office floor plan with labeled rooms",
      },
      {
        src: "/gallery/office-design.svg",
        alt: "The office plan converted into a tactile design",
      },
    ],
  },
  {
    id: "bottleneck",
    section: "The real bottleneck",
    title: "The printer isn’t the hard part.",
    emphasis: "Weeks of specialist design are.",
    body:
      "Every plan must be interpreted, simplified, brailled, checked, and commissioned by hand. The work is so slow and expensive that most buildings never get a tactile map.",
    images: [
      {
        src: "/gallery/study-cch-2f-plan.jpg",
        alt: "A complex convention center floor plan",
      },
      {
        src: "/gallery/test-library-floor-plan-source.png",
        alt: "A detailed library floor plan",
      },
      {
        src: "/gallery/test-library-floor-plan-design.svg",
        alt: "The library plan simplified into a tactile design",
      },
      {
        src: "/gallery/office-plan.png",
        alt: "An office floor plan before conversion",
      },
      {
        src: "/gallery/office-design.svg",
        alt: "The office floor plan after tactile conversion",
      },
    ],
  },
  {
    id: "agent",
    section: "The agentic answer",
    title: "Agents make the decisions. Geometry enforces the rules.",
    body:
      "Four focused agents do the judgment work. Typed operations, human review, and measured geometry keep the result trustworthy.",
    stages: [
      {
        label: "Read",
        src: "/gallery/office-plan.png",
        alt: "Original office floor plan",
      },
      {
        label: "Refine",
        src: "/gallery/office-design.svg",
        alt: "Agent-extracted office geometry",
      },
      {
        label: "Validate",
        src: "/gallery/test-library-floor-plan-design.svg",
        alt: "Standards-checked tactile library design",
      },
      {
        label: "Print",
        src: "/pitch-tactile-hero.png",
        alt: "Finished tactile map being read by hand",
      },
    ],
    proof: [
      "Parser ↔ critic loop",
      "Human review for uncertainty",
      "Zero violations before export",
    ],
  },
] as const;
