"use client";

import { useState } from "react";
import {
  applyOperations,
  elementsNeedingReview,
  findElement,
  NEEDS_REVIEW_THRESHOLD,
  type EditOperation,
  type FloorModel,
  type Point,
} from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { EditCanvas } from "@/components/map/edit-canvas";
import { Palette, type PlaceableKind } from "@/components/map/palette";
import { ReviewPanel } from "@/components/map/review-panel";
import { SelectionCard } from "@/components/map/selection-card";
import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";

const UNDO_LIMIT = 20;

function newId(kind: string): string {
  return `u-${kind}-${crypto.randomUUID().slice(0, 4)}`;
}

function defaultElement(
  kind: PlaceableKind,
  at: Point,
  model: FloorModel
): EditOperation & { op: "add" } {
  const { widthPx } = model.plan;
  const id = newId(kind);
  if (kind === "door" || kind === "window") {
    return {
      op: "add",
      element: {
        at,
        confidence: 1,
        id,
        kind,
        wallId: null,
        width: Math.max(24, Math.round(widthPx * 0.04)),
      },
    };
  }
  if (kind === "wall") {
    const half = Math.max(40, Math.round(widthPx * 0.06));
    return {
      op: "add",
      element: {
        a: { x: at.x - half, y: at.y },
        b: { x: at.x + half, y: at.y },
        confidence: 1,
        id,
        kind,
        thickness: Math.max(6, Math.round(widthPx * 0.008)),
      },
    };
  }
  if (kind === "room") {
    const half = Math.max(60, Math.round(widthPx * 0.08));
    return {
      op: "add",
      element: {
        confidence: 1,
        id,
        kind,
        label: null,
        polygon: [
          { x: at.x - half, y: at.y - half },
          { x: at.x + half, y: at.y - half },
          { x: at.x + half, y: at.y + half },
          { x: at.x - half, y: at.y + half },
        ],
      },
    };
  }
  return {
    op: "add",
    element: { at, confidence: 1, id, kind, rotation: 0 },
  };
}

type EditStepProps = {
  initialModel: FloorModel;
  initialVersion: number;
  onNext: () => void;
  projectId: string;
};

export function EditStep({
  initialModel,
  initialVersion,
  onNext,
  projectId,
}: EditStepProps) {
  const [model, setModel] = useState<FloorModel>(initialModel);
  const [version, setVersion] = useState(initialVersion);
  const [undoStack, setUndoStack] = useState<FloorModel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<PlaceableKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reviewElements = elementsNeedingReview(model);
  const selected = selectedId ? findElement(model, selectedId) : undefined;

  async function apply(operations: EditOperation[]) {
    setError(null);
    let next: FloorModel;
    try {
      next = applyOperations(model, operations);
    } catch {
      setError(mapContent.edit.saveFailed);
      return;
    }
    const previous = model;
    setModel(next);
    setUndoStack((stack) => [...stack.slice(-(UNDO_LIMIT - 1)), previous]);
    try {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/model/operations`,
        {
          body: JSON.stringify({ operations }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error(`Save failed with status ${response.status}`);
      }
      const { version: savedVersion } = (await response.json()) as {
        version: number;
      };
      setVersion(savedVersion);
    } catch {
      setModel(previous);
      setUndoStack((stack) => stack.slice(0, -1));
      setError(mapContent.edit.saveFailed);
    }
  }

  // Editing a flagged element implicitly vouches for it.
  function withConfirm(id: string, operations: EditOperation[]): EditOperation[] {
    const element = findElement(model, id);
    if (element && element.confidence < NEEDS_REVIEW_THRESHOLD) {
      return [...operations, { op: "confirm", id }];
    }
    return operations;
  }

  async function undo() {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setError(null);
    setUndoStack((stack) => stack.slice(0, -1));
    const current = model;
    setModel(previous);
    setSelectedId(null);
    try {
      const response = await fetch(`${API_URL}/projects/${projectId}/model`, {
        body: JSON.stringify(previous),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Undo save failed with status ${response.status}`);
      }
      const { version: savedVersion } = (await response.json()) as {
        version: number;
      };
      setVersion(savedVersion);
    } catch {
      setModel(current);
      setUndoStack((stack) => [...stack, previous]);
      setError(mapContent.edit.saveFailed);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {mapContent.modelLabel} · {mapContent.versionPrefix}
          {version}
          {model.title ? ` · ${model.title}` : null}
        </p>
        <div className="flex items-center gap-2">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            className="h-8 cursor-pointer rounded-sm px-3 text-xs"
            disabled={undoStack.length === 0}
            onClick={() => void undo()}
            size="sm"
            type="button"
            variant="outline"
          >
            {mapContent.edit.undoLabel}
          </Button>
          <Button
            className="h-8 cursor-pointer rounded-sm px-4 text-xs"
            disabled={reviewElements.length > 0}
            onClick={onNext}
            size="sm"
            type="button"
          >
            {mapContent.edit.nextLabel}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <EditCanvas
          model={model}
          onCanvasClick={(at) => {
            if (!placing) return;
            const operation = defaultElement(placing, at, model);
            setPlacing(null);
            void apply([operation]).then(() =>
              setSelectedId(operation.element.id)
            );
          }}
          onMove={(id, dx, dy) =>
            void apply(withConfirm(id, [{ op: "move", id, dx, dy }]))
          }
          onReshape={(id, points) =>
            void apply(withConfirm(id, [{ op: "reshape", id, points }]))
          }
          onSelect={setSelectedId}
          placing={placing !== null}
          selectedId={selectedId}
        />
        <aside className="flex flex-col gap-4">
          <Palette onPick={setPlacing} placing={placing} />
          {selected && (
            <SelectionCard
              element={selected}
              onConfirm={(id) => void apply([{ op: "confirm", id }])}
              onDelete={(id) => {
                setSelectedId(null);
                void apply([{ op: "delete", id }]);
              }}
              onRelabel={(id, label) =>
                void apply(withConfirm(id, [{ op: "relabel", id, label }]))
              }
            />
          )}
          <ReviewPanel
            elements={reviewElements}
            onConfirm={(id) => void apply([{ op: "confirm", id }])}
            onSelect={setSelectedId}
            selectedId={selectedId}
          />
        </aside>
      </div>
    </div>
  );
}
