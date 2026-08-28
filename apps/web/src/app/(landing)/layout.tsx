import type { ReactNode } from "react";
import { SiteNavbar } from "@/components/layout/site-navbar";

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNavbar />
      <main>{children}</main>
    </>
  );
}
