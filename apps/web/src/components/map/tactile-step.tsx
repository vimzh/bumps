"use client";

import { useCallback, useEffect, useState } from "react";
import {
  textToBrailleCells,
  type ConversionNote,
  type TactileDesign,
  type ValidationViolation,
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
  | {
      design: TactileDesign;
      iterations: { moves: number; violations: number }[];
      kind: "ready";
      notes: ConversionNote[];
      valid: boolean;
      violations: ValidationViolation[];
    };

export function TactileStep({ onBack, projectId }: TactileStepProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const convert = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const start = await fetch(`${API_URL}/projects/${projectId}/tactile`, {
        method: "POST",
      });
      if (!start.ok && start.status !== 202) {
        throw new Error(`Conversion start failed with status ${start.status}`);
      }
      // Poll until the background convert-validate-layout loop settles.
      for (let attempt = 0; attempt < 150; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const response = await fetch(
          `${API_URL}/projects/${projectId}/tactile`,
          { cache: "no-store" }
        );
        if (!response.ok) continue;
        const payload = (await response.json()) as {
          design: TactileDesign;
          error: string | null;
          iterations: { moves: number; violations: number }[];
          notes: ConversionNote[];
          status: "done" | "failed" | "running";
          valid: boolean;
          violations: ValidationViolation[];
        };
        if (payload.status === "running") continue;
        if (payload.status === "failed") {
          setState({
            kind: "error",
            message: payload.error ?? mapContent.tactile.failed,
          });
          return;
        }
        setState({
          design: payload.design,
          iterations: payload.iterations,
          kind: "ready",
          notes: payload.notes,
          valid: payload.valid,
          violations: payload.violations,
        });
        return;
      }
      throw new Error("Conversion timed out");
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
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {mapContent.tactile.title} · {mapContent.tactile.plateLabel}
            {state.kind === "ready" && state.design.title
              ? ` · ${state.design.title}`
              : null}
          </p>
          {state.kind === "ready" && (
            <span
              className={
                state.valid
                  ? "rounded-sm border border-foreground/30 px-2 py-0.5 font-mono text-xs"
                  : "rounded-sm border border-destructive px-2 py-0.5 font-mono text-xs text-destructive"
              }
            >
              {state.valid
                ? mapContent.tactile.readyBadge
                : mapContent.tactile.failedBadge}
            </span>
          )}
        </div>
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
            {state.iterations.length > 1 && (
              <p className="font-mono text-xs text-muted-foreground">
                {mapContent.tactile.iterationsLead}:{" "}
                {state.iterations.map((it) => it.violations).join(" → ")}
              </p>
            )}
            {state.violations.length > 0 && (
              <div className="rounded-sm border border-destructive bg-card p-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-destructive">
                  {mapContent.tactile.violationsTitle} ·{" "}
                  {state.violations.length}
                </h2>
                <ul className="mt-2 flex flex-col gap-1.5 text-xs text-destructive">
                  {state.violations.map((violation, index) => (
                    <li key={index}>
                      <span className="font-mono">[{violation.rule}]</span>{" "}
                      {violation.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
