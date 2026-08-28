import { landingContent } from "@/data/landing";

export function LandingFooter() {
  return (
    <footer className="absolute inset-x-0 bottom-0 flex justify-center py-6">
      <p className="text-xs text-muted-foreground">
        {landingContent.footer.poweredBy}
      </p>
    </footer>
  );
}
