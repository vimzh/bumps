"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StlPreview } from "@/components/map/stl-preview";
import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";

type ExportFile = {
  bbox: { max: [number, number, number]; min: [number, number, number] };
  kind: "legend" | "map";
  triangles: number;
};

type State =
  | { files: ExportFile[]; generatedAt: number; kind: "ready" }
  | { kind: "error"; message: string }
  | { kind: "loading" };

type ExportStepProps = {
  onBack: () => void;
  projectId: string;
};

export function ExportStep({ onBack, projectId }: ExportStepProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const generate = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch(`${API_URL}/projects/${projectId}/export`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: string;
        files?: ExportFile[];
      };
      if (!response.ok || !payload.files) {
        setState({
          kind: "error",
          message:
            response.status === 409
              ? mapContent.export.blocked
              : (payload.error ?? mapContent.export.failed),
        });
        return;
      }
      setState({ files: payload.files, generatedAt: Date.now(), kind: "ready" });
    } catch {
      setState({ kind: "error", message: mapContent.export.failed });
    }
  }, [projectId]);

  useEffect(() => {
    void generate();
  }, [generate]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {mapContent.export.title} · {mapContent.tactile.plateLabel}
        </p>
        <Button
          className="h-8 cursor-pointer rounded-sm px-3 text-xs"
          onClick={onBack}
          size="sm"
          type="button"
          variant="outline"
        >
          {mapContent.edit.backLabel}
        </Button>
      </div>
      {state.kind === "loading" && (
        <p className="animate-pulse text-sm text-muted-foreground">
          {mapContent.export.generating}
        </p>
      )}
      {state.kind === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button
            className="h-8 cursor-pointer rounded-sm px-3 text-xs"
            onClick={() => void generate()}
            size="sm"
            type="button"
          >
            {mapContent.export.retryLabel}
          </Button>
        </div>
      )}
      {state.kind === "ready" && (
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="min-w-0 flex-1 overflow-hidden rounded-sm border bg-muted/40">
            <StlPreview
              url={`${API_URL}/projects/${projectId}/export/map.stl?t=${state.generatedAt}`}
            />
          </div>
          <aside className="flex w-80 min-h-0 shrink-0 flex-col gap-3">
            {state.files.map((file) => (
              <div className="rounded-sm border bg-card p-3" key={file.kind}>
                <p className="font-mono text-xs text-muted-foreground">
                  {file.kind}.stl · {file.triangles.toLocaleString()}{" "}
                  {mapContent.export.trianglesSuffix} ·{" "}
                  {file.bbox.max[0] - file.bbox.min[0]} ×{" "}
                  {file.bbox.max[1] - file.bbox.min[1]} ×{" "}
                  {(file.bbox.max[2] - file.bbox.min[2]).toFixed(1)} mm
                </p>
                <Button
                  asChild
                  className="mt-2 h-8 w-full cursor-pointer rounded-sm text-xs"
                  size="sm"
                >
                  <a
                    href={`${API_URL}/projects/${projectId}/export/${file.kind}.stl`}
                  >
                    {file.kind === "map"
                      ? mapContent.export.downloadMap
                      : mapContent.export.downloadLegend}
                  </a>
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {mapContent.export.printHint}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
