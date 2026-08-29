import { StlPreview } from "@/components/map/stl-preview";
import { galleryContent, type GalleryItem } from "@/data/gallery";

type GalleryEntryProps = {
  entry: GalleryItem;
};

export function GalleryEntry({ entry }: GalleryEntryProps) {
  return (
    <article>
      <h2 className="text-base font-medium">{entry.title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {entry.description}
      </p>
      <div className="mt-4 grid grid-cols-1 divide-y overflow-hidden rounded-sm border md:grid-cols-2 md:divide-x md:divide-y-0">
        <figure>
          <figcaption className="border-b px-3 py-2 font-mono text-xs text-muted-foreground">
            {galleryContent.designLabel}
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- static gallery asset */}
          <img
            alt={`${entry.title} — ${galleryContent.designLabel}`}
            className="aspect-square w-full bg-white object-contain"
            src={entry.image}
          />
        </figure>
        <figure>
          <figcaption className="flex justify-between gap-3 border-b px-3 py-2 font-mono text-xs text-muted-foreground">
            <span>{galleryContent.stlLabel}</span>
            <span>{galleryContent.stlHint}</span>
          </figcaption>
          <div className="aspect-square w-full bg-muted/40">
            <StlPreview url={entry.stl} />
          </div>
        </figure>
      </div>
    </article>
  );
}
