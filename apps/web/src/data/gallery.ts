// Gallery entries pair the uploaded plan with its printable STL.
export type GalleryItem = {
  description: string;
  slug: string;
  source: string;
  stl: string;
  title: string;
};

export const galleryContent = {
  downloadLabel: "Download STL",
  empty: "Showcase pieces are on their way.",
  entries: [
    {
      description:
        "The current five-pass pipeline parsed this community-center plan into 38 rooms, 77 walls, 69 verified openings, 6 navigation features, and 5 furniture groups. Its zero-violation 2 × 2 board assembles to 400 × 400 mm.",
      slug: "fountain-hills-community-center",
      source: "/gallery/fountain-hills-source.png",
      stl: "/gallery/fountain-hills-map.stl",
      title: "Fountain Hills Community Center",
    },
    {
      description:
        "The current five-pass pipeline parsed the Burke Museum second floor into 9 rooms, 22 walls, 1 verified opening, and 8 navigation features. The zero-violation result fits one 200 × 200 mm plate.",
      slug: "burke-museum",
      source: "/gallery/burke-museum-source.png",
      stl: "/gallery/burke-museum-map.stl",
      title: "Burke Museum · Second floor",
    },
    {
      description:
        "The current five-pass pipeline parsed Buffalo's Downtown Central Library into 20 rooms, 51 walls, and 7 verified openings. Its zero-violation 1 × 2 board assembles to 200 × 400 mm.",
      slug: "buffalo-downtown-central-library",
      source: "/gallery/buffalo-library-source.png",
      stl: "/gallery/buffalo-library-map.stl",
      title: "Buffalo Downtown Central Library",
    },
    {
      description:
        "Yonkers Riverfront Library parsed into 14 rooms, 52 walls, 13 openings, and 9 navigation features. The detailed zero-violation map uses a 2 × 2 grid with a 400 × 400 mm assembled footprint.",
      slug: "yonkers-riverfront-library",
      source: "/gallery/yonkers-library-source.png",
      stl: "/gallery/yonkers-library-map.stl",
      title: "Yonkers Riverfront Library",
    },
    {
      description:
        "The CAA Ed Mirvish Theatre orchestra floor parsed into 8 rooms, 31 walls, 11 openings, and 18 navigation or seating features. Its zero-violation 2 × 2 board assembles to 400 × 400 mm.",
      slug: "caa-ed-mirvish-theatre",
      source: "/gallery/ed-mirvish-source.png",
      stl: "/gallery/ed-mirvish-map.stl",
      title: "CAA Ed Mirvish Theatre · Orchestra floor",
    },
    {
      description:
        "A dense fourth-story library plan parsed into 8 rooms, 56 walls, 12 openings, and 14 features or furniture groups. The valid tactile result uses a 1 × 2 plate grid; deterministic geometry reduced 8 initial violations to zero.",
      slug: "test-library-fourth-story",
      source: "/gallery/test-library-fourth-story-source.jpg",
      stl: "/gallery/test-library-fourth-story.stl",
      title: "Library · Fourth story",
    },
    {
      description:
        "The current pipeline parsed this compact library into 5 rooms, 13 walls, 4 verified openings, 4 navigation features, and 11 furniture groups. Its zero-violation result fits one 200 × 200 mm plate.",
      slug: "test-library-floor-plan",
      source: "/gallery/test-library-floor-plan-source.png",
      stl: "/gallery/test-library-floor-plan.stl",
      title: "Library floor plan",
    },
    {
      description:
        "The current pipeline parsed this color-separated restroom plan into 10 rooms, 25 walls, 10 verified openings, 3 navigation features, and 3 fixture groups. Its zero-violation result fits one 200 × 200 mm plate.",
      slug: "test-public-restrooms",
      source: "/gallery/test-public-restrooms-source.png",
      stl: "/gallery/test-public-restrooms.stl",
      title: "Public restrooms",
    },
    {
      description:
        "The current five-pass pipeline parsed this courtyard museum into 9 rooms, 46 walls, 10 verified openings, 11 navigation features, and 1 furniture group. Its zero-violation result fits one 200 × 200 mm plate.",
      slug: "test-courtyard-museum",
      source: "/gallery/test-courtyard-museum-source.jpg",
      stl: "/gallery/test-courtyard-museum.stl",
      title: "Courtyard museum",
    },
    {
      description:
        "A labeled museum plan parsed into 17 rooms, 55 wall segments, 10 openings, and 9 navigation features. Five-partition door gaps and the curved Hare Gallery boundary survived conversion; deterministic repair cleared all 29 tactile conflicts on one plate.",
      slug: "test-museum-floor-plan",
      source: "/gallery/test-museum-floor-plan-source.png",
      stl: "/gallery/test-museum-floor-plan.stl",
      title: "Museum floor plan",
    },
    {
      description:
        "The current pipeline parsed this small office into 5 rooms, 14 walls, 5 verified openings, 3 navigation features, and 3 furniture groups. Its zero-violation result fits one 200 × 200 mm plate.",
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
