import { InfoPage } from "@/components/landing/info-page";
import { pagesContent } from "@/data/pages";

export default function TheNeedForThisPage() {
  return (
    <InfoPage
      paragraphs={pagesContent.theNeed.paragraphs}
      title={pagesContent.theNeed.title}
    />
  );
}
