import { notFound } from "next/navigation";
import type { FloorModel } from "@bumps/floor-model";
import { ParseView } from "@/components/map/parse-view";
import { Wizard } from "@/components/map/wizard";
import { WizardStepper } from "@/components/map/wizard-stepper";
import { API_URL } from "@/lib/api";

type Project = {
  id: string;
  name: string;
  parseError: string | null;
  parseProgress: Parameters<typeof ParseView>[0]["initialProgress"];
  status: "failed" | "parsed" | "parsing" | "uploaded";
};

export default async function MapPage({ params }: PageProps<"/map/[id]">) {
  const { id } = await params;
  const projectResponse = await fetch(`${API_URL}/projects/${id}`, {
    cache: "no-store",
  });
  if (!projectResponse.ok) {
    notFound();
  }
  const project = (await projectResponse.json()) as Project;

  const modelResponse = await fetch(`${API_URL}/projects/${id}/model`, {
    cache: "no-store",
  });
  if (!modelResponse.ok) {
    return (
      <div className="relative">
        <div className="absolute inset-x-0 top-0">
          <WizardStepper current="parse" />
        </div>
        <ParseView
          initialError={project.parseError}
          initialProgress={project.parseProgress}
          initialStatus={project.status}
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    );
  }
  const { model, version } = (await modelResponse.json()) as {
    model: FloorModel;
    version: number;
  };

  return (
    <Wizard
      initialModel={model}
      initialVersion={version}
      projectId={project.id}
    />
  );
}
