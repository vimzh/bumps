import Link from "next/link";
import { navigationContent } from "@/data/navigation";

export function SiteNavbar() {
  return (
    <nav
      aria-label={navigationContent.label}
      className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-8 py-6"
    >
      {navigationContent.links.map((link) => (
        <Link
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
