import Image from "next/image";
import Link from "next/link";
import { navigationContent } from "@/data/navigation";
import { pagesContent } from "@/data/pages";

const examples = [pagesContent.inputGuide.good, pagesContent.inputGuide.bad];

export default function InputGuidePage() {
  return (
    <article className="mx-auto min-h-dvh max-w-5xl px-6 py-28">
      <Link
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        href={navigationContent.home.href}
      >
        {navigationContent.home.label}
      </Link>
      <header className="mt-6 max-w-2xl">
        <h1 className="font-pixel text-4xl tracking-tight sm:text-5xl">
          {pagesContent.inputGuide.title}
        </h1>
        <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {pagesContent.inputGuide.intro}
        </p>
      </header>

      <div className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2">
        {examples.map((example) => (
          <section className="bg-background p-5 sm:p-6" key={example.label}>
            <p className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {example.label}
            </p>
            <h2 className="mt-2 text-xl font-medium tracking-tight">
              {example.title}
            </h2>
            <div className="mt-5 overflow-hidden rounded-md border bg-white">
              <Image
                alt={example.alt}
                className="aspect-[8/5] w-full object-contain"
                height={900}
                loading="eager"
                sizes="(min-width: 768px) 448px, calc(100vw - 88px)"
                src={example.image}
                width={1600}
              />
            </div>
            <ul className="mt-5 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {example.points.map((point) => (
                <li className="flex gap-3" key={point}>
                  <span aria-hidden="true" className="font-mono text-foreground">
                    —
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 max-w-2xl border-l-2 border-foreground pl-4 text-sm leading-relaxed text-muted-foreground">
        {pagesContent.inputGuide.rule}
      </p>
    </article>
  );
}
