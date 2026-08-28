import { InfoPage } from "@/components/landing/info-page";
import { pagesContent } from "@/data/pages";

export default function HowItWorksPage() {
  return (
    <InfoPage
      steps={pagesContent.howItWorks.steps}
      title={pagesContent.howItWorks.title}
    />
  );
}
