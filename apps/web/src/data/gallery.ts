// Gallery entries pair a design image with its printable STL. To add one:
// drop the files into apps/web/public/gallery/ and add an entry here.
export type GalleryItem = {
  description: string;
  image: string;
  slug: string;
  stl: string;
  title: string;
};

export const galleryContent = {
  designLabel: "Design",
  empty: "Showcase pieces are on their way.",
  entries: [
    {
      description:
        "A small office — reception, workstations, meeting room — parsed, reviewed, and converted to a 200 × 200 mm tactile plate with braille keys and furniture blocks.",
      image: "/gallery/office-plan.png",
      slug: "office-plan",
      stl: "/gallery/office-map.stl",
      title: "Office floor plan",
    },
    {
      description:
        "Level 2 of the Congress Center Hamburg — a venue with a real tactile map on site. Too large for one plate, so the engine fit it on a 2 × 1 grid: two 200 × 200 mm plates that assemble into the seamless 400 × 200 mm map shown here, with braille hall keys and clubbed seating blocks.",
      image: "/gallery/study-cch-2f-plan.jpg",
      slug: "study-cch-2f",
      stl: "/gallery/study-cch-2f.stl",
      title: "Congress Center Hamburg · 2F",
    },
    {
      description:
        "The Getty Museum entrance hall, from our compliance study against venues with verified tactile maps. Walls, a doorway gap, elevator and restroom symbols, and braille keys — zero standards violations on the first validator pass.",
      image: "/gallery/study-getty-plan.jpg",
      slug: "study-getty",
      stl: "/gallery/study-getty.stl",
      title: "Getty Museum · Entrance",
    },
    {
      description:
        "A historic Metropolitan Museum floor plan: five labeled galleries, twelve walls split by four doorway gaps, furniture blocks, and an eight-key braille legend. The parse loop refined itself three times before the validator counted zero violations.",
      image: "/gallery/study-met-historic-plan.jpg",
      slug: "study-met-historic",
      stl: "/gallery/study-met-historic.stl",
      title: "The Met · Historic Plan",
    },
    {
      description:
        "Queen Mary University Graduate Centre — a corridor with four stairwells and a service counter, fit on a 2 × 1 plate grid. Every violation was repaired by deterministic geometry: the layout agent was never consulted.",
      image: "/gallery/study-queenmary-plan.jpg",
      slug: "study-queenmary",
      stl: "/gallery/study-queenmary.stl",
      title: "Queen Mary · Graduate Centre",
    },
    {
      description:
        "Queens College's campus map — no interior walls to draw, so 28 building footprints render as raised blocks with braille keys, the way real printed campus tactile maps do it. Dense, but every clearance measures legal.",
      image: "/gallery/study-queenscollege-plan.jpg",
      slug: "study-queenscollege",
      stl: "/gallery/study-queenscollege.stl",
      title: "Queens College Campus",
    },
    {
      description:
        "Portland State's downtown campus — eleven buildings as raised keyed blocks, mirroring PSU's own 3D-printed braille campus tiles. Zero violations without a single layout pass.",
      image: "/gallery/study-psu-plan.jpg",
      slug: "study-psu",
      stl: "/gallery/study-psu.stl",
      title: "Portland State Campus",
    },
  ] as readonly GalleryItem[],
  stlLabel: "3D-printable plate",
  stlHint: "Drag to orbit · scroll to zoom",
  title: "Gallery",
} as const;
