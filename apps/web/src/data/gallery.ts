// Gallery entries pair the uploaded plan, parsed SVG, and printable STL.
export type GalleryItem = {
  design: string;
  description: string;
  slug: string;
  source: string;
  stl: string;
  title: string;
};

export const galleryContent = {
  designLabel: "Parsed SVG",
  downloadLabel: "Download STL",
  empty: "Showcase pieces are on their way.",
  entries: [
    {
      design: "/gallery/fountain-hills-design.svg",
      description:
        "An official community-center plan parsed into 38 rooms, 64 walls, 35 openings, and 4 navigation features. Measurement-only labels were omitted; deterministic repair cleared all 16 tactile conflicts on a 400 × 200 mm, 2 × 1 board.",
      slug: "fountain-hills-community-center",
      source: "/gallery/fountain-hills-source.png",
      stl: "/gallery/fountain-hills-map.stl",
      title: "Fountain Hills Community Center",
    },
    {
      design: "/gallery/burke-museum-design.svg",
      description:
        "The Burke Museum second-floor plan parsed into 10 rooms, 20 walls, 1 opening, and 9 navigation features. The zero-violation result fits one 200 × 200 mm plate.",
      slug: "burke-museum",
      source: "/gallery/burke-museum-source.png",
      stl: "/gallery/burke-museum-map.stl",
      title: "Burke Museum · Second floor",
    },
    {
      design: "/gallery/buffalo-library-design.svg",
      description:
        "Buffalo's Downtown Central Library main floor parsed into 17 rooms, 36 walls, 11 openings, and 12 navigation features. Its valid 1 × 2 board assembles to 200 × 400 mm.",
      slug: "buffalo-downtown-central-library",
      source: "/gallery/buffalo-library-source.png",
      stl: "/gallery/buffalo-library-map.stl",
      title: "Buffalo Downtown Central Library",
    },
    {
      design: "/gallery/yonkers-library-design.svg",
      description:
        "Yonkers Riverfront Library parsed into 14 rooms, 52 walls, 13 openings, and 9 navigation features. The detailed zero-violation map uses a 2 × 2 grid with a 400 × 400 mm assembled footprint.",
      slug: "yonkers-riverfront-library",
      source: "/gallery/yonkers-library-source.png",
      stl: "/gallery/yonkers-library-map.stl",
      title: "Yonkers Riverfront Library",
    },
    {
      design: "/gallery/ed-mirvish-design.svg",
      description:
        "The CAA Ed Mirvish Theatre orchestra floor parsed into 8 rooms, 31 walls, 11 openings, and 18 navigation or seating features. Its zero-violation 2 × 2 board assembles to 400 × 400 mm.",
      slug: "caa-ed-mirvish-theatre",
      source: "/gallery/ed-mirvish-source.png",
      stl: "/gallery/ed-mirvish-map.stl",
      title: "CAA Ed Mirvish Theatre · Orchestra floor",
    },
    {
      design: "/gallery/test-library-fourth-story-design.svg",
      description:
        "A dense fourth-story library plan parsed into 8 rooms, 56 walls, 12 openings, and 14 features or furniture groups. The valid tactile result uses a 1 × 2 plate grid; deterministic geometry reduced 8 initial violations to zero.",
      slug: "test-library-fourth-story",
      source: "/gallery/test-library-fourth-story-source.jpg",
      stl: "/gallery/test-library-fourth-story.stl",
      title: "Library · Fourth story",
    },
    {
      design: "/gallery/test-library-floor-plan-design.svg",
      description:
        "A compact library and study-room plan parsed into 5 rooms, 11 walls, 4 openings, and 10 furniture groups. It fits one 200 × 200 mm plate and passed validation after deterministic repair.",
      slug: "test-library-floor-plan",
      source: "/gallery/test-library-floor-plan-source.png",
      stl: "/gallery/test-library-floor-plan.stl",
      title: "Library floor plan",
    },
    {
      design: "/gallery/test-public-restrooms-design.svg",
      description:
        "A color-separated public restroom plan parsed into 9 rooms, 25 walls, 9 openings, and 10 fixture groups. Deterministic repair cleared 14 of 15 violations; one layout move cleared the last before export.",
      slug: "test-public-restrooms",
      source: "/gallery/test-public-restrooms-source.png",
      stl: "/gallery/test-public-restrooms.stl",
      title: "Public restrooms",
    },
    {
      design: "/gallery/test-courtyard-museum-design.svg",
      description:
        "A courtyard museum plan parsed into 10 labeled rooms, 31 walls, 8 openings, and 10 navigation features. Its 1 × 2 plate grid passed with zero violations after the shared deterministic clearance repair.",
      slug: "test-courtyard-museum",
      source: "/gallery/test-courtyard-museum-source.jpg",
      stl: "/gallery/test-courtyard-museum.stl",
      title: "Courtyard museum",
    },
    {
      design: "/gallery/test-museum-floor-plan-design.svg",
      description:
        "A labeled museum plan parsed into 17 rooms, 55 wall segments, 10 openings, and 9 navigation features. Five-partition door gaps and the curved Hare Gallery boundary survived conversion; deterministic repair cleared all 29 tactile conflicts on one plate.",
      slug: "test-museum-floor-plan",
      source: "/gallery/test-museum-floor-plan-source.png",
      stl: "/gallery/test-museum-floor-plan.stl",
      title: "Museum floor plan",
    },
    {
      design: "/gallery/office-design.svg",
      description:
        "A small office — reception, workstations, meeting room — parsed, reviewed, and converted to a 200 × 200 mm tactile plate with braille keys and furniture blocks.",
      slug: "office-plan",
      source: "/gallery/office-plan.png",
      stl: "/gallery/office-map.stl",
      title: "Office floor plan",
    },
  ] as readonly GalleryItem[],
  plateDimensions:
    "Each printable tile measures 200 × 200 mm. A 3 mm base and raised features produce a maximum map height of 4.5 mm; multi-tile examples join into the larger footprint shown.",
  sourceLabel: "Uploaded plan",
  stlLabel: "3D-printable plate",
  title: "Gallery",
} as const;
