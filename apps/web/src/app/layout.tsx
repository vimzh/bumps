import type { Metadata } from "next";
import "./globals.css";
import { DM_Mono } from "next/font/google";
import { GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import { siteContent } from "@/data/site";
import { cn } from "@/lib/utils";

const dmMono = DM_Mono({
  subsets: ["latin"],
  variable: "--font-dm-mono",
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: siteContent.title,
  description: siteContent.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "font-sans antialiased",
        GeistSans.variable,
        dmMono.variable,
        GeistPixelSquare.variable
      )}
    >
      <body>{children}</body>
    </html>
  );
}
