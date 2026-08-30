import { DownloadIcon } from "lucide-react";
import { StlPreview } from "@/components/map/stl-preview";
import { Button } from "@/components/ui/button";
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
      <div className="mt-4 grid grid-cols-1 divide-y overflow-hidden rounded-sm border md:grid-cols-3 md:divide-x md:divide-y-0">
        <figure>
          <figcaption className="border-b px-3 py-2 font-mono text-xs text-muted-foreground">
            {galleryContent.sourceLabel}
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- static gallery asset */}
          <img
            alt={`${entry.title} — ${galleryContent.sourceLabel}`}
            className="aspect-square w-full bg-white object-contain"
            src={entry.source}
          />
        </figure>
        <figure>
          <figcaption className="border-b px-3 py-2 font-mono text-xs text-muted-foreground">
            {galleryContent.designLabel}
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- static gallery asset */}
          <img
            alt={`${entry.title} — ${galleryContent.designLabel}`}
            className="aspect-square w-full bg-white object-contain"
            src={entry.design}
          />
        </figure>
        <figure>
          <figcaption className="flex items-center justify-between gap-3 border-b px-3 py-1.5 font-mono text-xs text-muted-foreground">
            <span>{galleryContent.stlLabel}</span>
            <Button asChild size="xs" variant="outline">
              <a download={`${entry.slug}.stl`} href={entry.stl}>
                <DownloadIcon data-icon="inline-start" />
                {galleryContent.downloadLabel}
              </a>
            </Button>
          </figcaption>
          <div className="aspect-square w-full bg-muted/40">
            <StlPreview url={entry.stl} />
          </div>
        </figure>
      </div>
    </article>
  );
}
