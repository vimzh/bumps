import Link from "next/link";
import { GalleryEntry } from "@/components/landing/gallery-entry";
import { galleryContent } from "@/data/gallery";
import { navigationContent } from "@/data/navigation";

export default function GalleryPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-16 pt-24">
      <Link
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        href={navigationContent.home.href}
      >
        {navigationContent.home.label}
      </Link>
      <h1 className="mt-6 font-pixel text-4xl tracking-tight sm:text-5xl">
        {galleryContent.title}
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
        {galleryContent.plateDimensions}
      </p>
      {galleryContent.entries.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {galleryContent.empty}
        </p>
      ) : (
        <div className="mt-10 flex flex-col gap-14">
          {galleryContent.entries.map((entry) => (
            <GalleryEntry entry={entry} key={entry.slug} />
          ))}
        </div>
      )}
    </section>
  );
}
