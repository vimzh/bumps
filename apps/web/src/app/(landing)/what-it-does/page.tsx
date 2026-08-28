import { InfoPage } from "@/components/landing/info-page";
import { pagesContent } from "@/data/pages";

export default function WhatItDoesPage() {
  return (
    <InfoPage
      paragraphs={pagesContent.whatItDoes.paragraphs}
      title={pagesContent.whatItDoes.title}
    />
  );
}
