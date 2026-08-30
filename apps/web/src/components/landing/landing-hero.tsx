import { UploadButton } from "@/components/landing/upload-button";
import { landingContent } from "@/data/landing";

export function LandingHero() {
  return (
    <section className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-pixel font-bold text-7xl tracking-tight sm:text-8xl md:text-9xl">
        {landingContent.hero.brand}
      </h1>
      <p className="mt-4 text-xl font-medium tracking-tight sm:text-2xl">
        {landingContent.hero.subheading}
      </p>
      <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
        {landingContent.hero.tagline}
      </p>
      <div className="mt-8">
        <UploadButton />
      </div>
      <p className="mt-12 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
        {landingContent.hero.compliance.lead}{" "}
        {landingContent.hero.compliance.standards.map((standard, index) => (
          <span key={standard.name}>
            {index > 0 && " and "}
            <a
              className="whitespace-nowrap font-mono text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:decoration-foreground"
              href={standard.href}
              rel="noopener noreferrer"
              target="_blank"
              title={standard.fullName}
            >
              {standard.name}
            </a>
          </span>
        ))}{" "}
        {landingContent.hero.compliance.tail}
      </p>
    </section>
  );
}
