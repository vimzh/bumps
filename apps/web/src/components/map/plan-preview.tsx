import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";

type PlanPreviewProps = {
  projectId: string;
  projectName: string;
};

export function PlanPreview({ projectId, projectName }: PlanPreviewProps) {
  return (
    <section className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <header className="text-center">
        <p className="text-sm text-muted-foreground">
          {mapContent.uploadedLabel}
        </p>
        <h1 className="mt-1 font-mono text-base">{projectName}</h1>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element -- API-served image, dimensions unknown */}
      <img
        alt={mapContent.planAlt}
        className="max-h-[70dvh] w-auto max-w-full border"
        src={`${API_URL}/projects/${projectId}/plan`}
      />
    </section>
  );
}
