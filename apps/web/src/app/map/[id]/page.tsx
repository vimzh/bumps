import { notFound } from "next/navigation";
import { PlanPreview } from "@/components/map/plan-preview";
import { API_URL } from "@/lib/api";

export default async function MapPage({ params }: PageProps<"/map/[id]">) {
  const { id } = await params;
  const response = await fetch(`${API_URL}/projects/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    notFound();
  }
  const project = (await response.json()) as { id: string; name: string };

  return <PlanPreview projectId={project.id} projectName={project.name} />;
}
