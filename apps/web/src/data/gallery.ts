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
  ] as readonly GalleryItem[],
  stlLabel: "3D-printable plate",
  stlHint: "Drag to orbit · scroll to zoom",
  title: "Gallery",
} as const;
