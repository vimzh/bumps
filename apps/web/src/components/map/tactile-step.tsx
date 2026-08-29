"use client";

import { useCallback, useEffect, useState } from "react";
import {
  textToBrailleCells,
  type ConversionNote,
  type TactileDesign,
} from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { CanvasViewport } from "@/components/map/canvas-viewport";
import { TactileViewer } from "@/components/map/tactile-viewer";
import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";

type TactileStepProps = {
  onBack: () => void;
  projectId: string;
};

type State =
  | { kind: "error"; message: string }
  | { kind: "loading" }
  | { design: TactileDesign; kind: "ready"; notes: ConversionNote[] };

export function TactileStep({ onBack, projectId }: TactileStepProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const convert = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/tactile`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(`Conversion failed with status ${response.status}`);
      }
      const payload = (await response.json()) as {
        design: TactileDesign;
        notes: ConversionNote[];
      };
      setState({ design: payload.design, kind: "ready", notes: payload.notes });
    } catch {
      setState({ kind: "error", message: mapContent.tactile.failed });
    }
  }, [projectId]);

  useEffect(() => {
    void convert();
  }, [convert]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {mapContent.tactile.title} · {mapContent.tactile.plateLabel}
          {state.kind === "ready" && state.design.title
            ? ` · ${state.design.title}`
            : null}
        </p>
        <div className="flex items-center gap-2">
          <Button
            className="h-8 cursor-pointer rounded-sm px-3 text-xs"
            onClick={onBack}
            size="sm"
            type="button"
            variant="outline"
          >
            {mapContent.edit.backLabel}
          </Button>
          <Button
            className="h-8 cursor-pointer rounded-sm px-3 text-xs"
            disabled={state.kind === "loading"}
            onClick={() => void convert()}
            size="sm"
            type="button"
            variant="outline"
          >
            {mapContent.tactile.reconvertLabel}
          </Button>
        </div>
      </div>
      {state.kind === "loading" && (
        <p className="animate-pulse text-sm text-muted-foreground">
          {mapContent.tactile.converting}
        </p>
      )}
      {state.kind === "error" && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button
            className="h-8 cursor-pointer rounded-sm px-3 text-xs"
            onClick={() => void convert()}
            size="sm"
            type="button"
          >
            {mapContent.tactile.retryLabel}
          </Button>
        </div>
      )}
      {state.kind === "ready" && (
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="min-w-0 flex-1">
            <CanvasViewport
              contentHeight={state.design.plate.heightMm}
              contentWidth={state.design.plate.widthMm}
            >
              <TactileViewer design={state.design} />
            </CanvasViewport>
          </div>
          <aside className="flex w-80 min-h-0 shrink-0 flex-col gap-3 overflow-y-auto">
            <div className="rounded-sm border bg-card p-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {mapContent.tactile.legendTitle} · {state.design.legend.length}
              </h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {state.design.legend.map((entry) => (
                  <li className="flex items-baseline gap-3 text-xs" key={entry.key}>
                    <span className="font-mono text-muted-foreground">
                      {entry.key} ({textToBrailleCells(entry.key).length}⠿)
                    </span>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
              {state.design.separateLegendPlate && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {mapContent.tactile.separatePlate}
                </p>
              )}
            </div>
            {state.notes.length > 0 && (
              <div className="rounded-sm border bg-card p-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {mapContent.tactile.notesTitle} · {state.notes.length}
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                  {state.notes.map((note) => (
                    <li key={`${note.kind}-${note.elementId}`}>{note.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {mapContent.tactile.exportHint}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
