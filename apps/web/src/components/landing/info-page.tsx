import Link from "next/link";
import { navigationContent } from "@/data/navigation";

type InfoPageProps = {
  paragraphs?: readonly string[];
  steps?: readonly { description: string; title: string }[];
  title: string;
};

export function InfoPage({ paragraphs, steps, title }: InfoPageProps) {
  return (
    <article className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-28">
      <Link
        className="mb-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
        href={navigationContent.home.href}
      >
        {navigationContent.home.label}
      </Link>
      <h1 className="font-pixel text-4xl tracking-tight sm:text-5xl">{title}</h1>
      {paragraphs?.map((paragraph) => (
        <p
          className="mt-6 text-pretty text-base leading-relaxed text-muted-foreground"
          key={paragraph}
        >
          {paragraph}
        </p>
      ))}
      {steps ? (
        <ol className="mt-10 space-y-8">
          {steps.map((step, index) => (
            <li className="flex gap-5" key={step.title}>
              <span className="font-mono text-sm leading-6 text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-base font-medium leading-6">{step.title}</h2>
                <p className="mt-1 text-pretty text-base leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}
