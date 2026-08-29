"use client";

import { useCallback, useEffect, useState } from "react";
import {
  compositeSize,
  textToBrailleCells,
  type ConversionNote,
  type TactileDesign,
  type ValidationViolation,
} from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { CanvasViewport } from "@/components/map/canvas-viewport";
import { MapTopBar } from "@/components/map/map-top-bar";
import { TactileViewer } from "@/components/map/tactile-viewer";
import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";

type TactileStepProps = {
  onBack: () => void;
  onNext: () => void;
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

export function TactileStep({ onBack, onNext, projectId }: TactileStepProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const grid =
    state.kind === "ready"
      ? (state.design.grid ?? { cols: 1, rows: 1 })
      : { cols: 1, rows: 1 };
  const multiPlate = grid.cols * grid.rows > 1;
  const plateLabel =
    state.kind === "ready" && multiPlate
      ? `${grid.cols} × ${grid.rows} · ${compositeSize(state.design).widthMm} × ${compositeSize(state.design).heightMm} mm ${mapContent.tactile.assembledSuffix}`
      : mapContent.tactile.plateLabel;

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
    <div className="flex min-h-0 flex-1 flex-col">
      <MapTopBar
        actions={
          <>
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
            <Button
              className="h-8 cursor-pointer rounded-sm px-4 text-xs"
              disabled={state.kind !== "ready" || !state.valid}
              onClick={onNext}
              size="sm"
              type="button"
            >
              {mapContent.edit.nextLabel}
            </Button>
          </>
        }
        current="tactile"
        info={
          <>
            <span className="truncate">
              {mapContent.tactile.title} · {plateLabel}
              {state.kind === "ready" && state.design.title
                ? ` · ${state.design.title}`
                : null}
            </span>
            {state.kind === "ready" && (
              <span
                className={
                  state.valid
                    ? "shrink-0 rounded-sm border border-foreground/30 px-2 py-0.5 font-mono text-xs text-foreground"
                    : "shrink-0 rounded-sm border border-destructive px-2 py-0.5 font-mono text-xs text-destructive"
                }
              >
                {state.valid
                  ? mapContent.tactile.readyBadge
                  : mapContent.tactile.failedBadge}
              </span>
            )}
          </>
        }
      />
      {state.kind === "loading" && (
        <p className="animate-pulse p-4 text-sm text-muted-foreground">
          {mapContent.tactile.converting}
        </p>
      )}
      {state.kind === "error" && (
        <div className="flex items-center gap-3 p-4">
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
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <CanvasViewport
              contentHeight={compositeSize(state.design).heightMm}
              contentWidth={compositeSize(state.design).widthMm}
            >
              <TactileViewer design={state.design} />
            </CanvasViewport>
          </div>
          <aside className="flex w-80 min-h-0 shrink-0 flex-col gap-3 overflow-y-auto border-l bg-card p-3">
            {state.notes
              .filter((note) => note.kind === "multi-plate")
              .map((note) => (
                <div
                  className="rounded-sm border border-(--color-brand)/50 bg-(--color-brand)/5 p-3 text-xs"
                  key={note.elementId}
                >
                  {note.message}
                </div>
              ))}
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
