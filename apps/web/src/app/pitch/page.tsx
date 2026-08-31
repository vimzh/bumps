import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { PitchDeck } from "@/components/pitch/pitch-deck";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "bumps — hackathon pitch",
  description: "Three-slide opening deck for the bumps demo video.",
};

export default function PitchPage() {
  return <PitchDeck fontClassName={manrope.className} />;
}
