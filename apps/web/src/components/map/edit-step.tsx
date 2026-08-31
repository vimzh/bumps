"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
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
import {
  AddMenu,
  placeModeFor,
  type PlaceableKind,
} from "@/components/map/add-menu";
import { CanvasViewport } from "@/components/map/canvas-viewport";
import { EditCanvas } from "@/components/map/edit-canvas";
import {
  editorGridStep,
  gridOriginForWalls,
} from "@/components/map/editor-geometry";
import { MapTopBar } from "@/components/map/map-top-bar";
import { PromptPanel } from "@/components/map/prompt-panel";
import { ReviewPanel } from "@/components/map/review-panel";
import { SelectionCard } from "@/components/map/selection-card";
import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";

const UNDO_LIMIT = 20;

function newId(kind: string): string {
  return `u-${kind}-${crypto.randomUUID().slice(0, 4)}`;
}

function pointElement(
  kind: Exclude<
    PlaceableKind,
    "door" | "furniture" | "path" | "road" | "room" | "wall"
  >,
  at: Point,
  model: FloorModel
): EditOperation & { op: "add" } {
  const id = newId(kind);
  if (kind === "window") {
    return {
      op: "add",
      element: {
        at,
        confidence: 1,
        id,
        kind,
        wallId: null,
        width: Math.max(24, Math.round(model.plan.widthPx * 0.04)),
      },
    };
  }
  return {
    op: "add",
    element: { at, confidence: 1, id, kind, rotation: 0 },
  };
}

function doorElement(
  at: Point,
  width: number,
  wallId: string
): EditOperation & { op: "add" } {
  return {
    op: "add",
    element: {
      at,
      confidence: 1,
      id: newId("door"),
      kind: "door",
      wallId,
      width,
    },
  };
}

function roomElement(a: Point, b: Point): EditOperation & { op: "add" } {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const polygon = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  return {
    op: "add",
    element: { confidence: 1, id: newId("room"), kind: "room", label: null, polygon },
  };
}

function furnitureElement(
  polygon: Point[],
  label: string
): EditOperation & { op: "add" } {
  return {
    op: "add",
    element: {
      confidence: 1,
      id: newId("furniture"),
      kind: "furniture",
      label: label.trim() || "furniture",
      polygon,
    },
  };
}

function lineElement(
  a: Point,
  b: Point,
  model: FloorModel
): EditOperation & { op: "add" } {
  return {
    op: "add",
    element: {
      a,
      b,
      confidence: 1,
      id: newId("wall"),
      kind: "wall",
      thickness: Math.max(6, Math.round(model.plan.widthPx * 0.008)),
    },
  };
}

function pathElement(a: Point, b: Point): EditOperation & { op: "add" } {
  return {
    op: "add",
    element: {
      confidence: 1,
      id: newId("path"),
      kind: "path",
      points: [a, b],
    },
  };
}

function roadElement(
  a: Point,
  b: Point,
  model: FloorModel
): EditOperation & { op: "add" } {
  return {
    op: "add",
    element: {
      confidence: 1,
      id: newId("road"),
      kind: "road",
      label: null,
      points: [a, b],
      widthPx: Math.max(14, Math.round(model.plan.widthPx * 0.015)),
    },
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
  const [furnitureLabel, setFurnitureLabel] = useState("");
  const [focusLabelId, setFocusLabelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorGrid, setEditorGrid] = useState(() => {
    const step = editorGridStep(initialModel.plan.widthPx);
    return { origin: gridOriginForWalls(initialModel.walls, step), step };
  });

  const handleGridChange = useCallback((origin: Point, step: number) => {
    setEditorGrid((current) =>
      current.step === step &&
      current.origin.x === origin.x &&
      current.origin.y === origin.y
        ? current
        : { origin, step }
    );
  }, []);

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

  const { heightPx, widthPx } = model.plan;
  // Original plan and model share one canvas space, side by side.
  const gap = Math.round(widthPx * 0.04);

  // Cmd/Ctrl+Z, except while typing in an input.
  const undoFromShortcut = useEffectEvent(() => {
    void undo();
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        const target = event.target as HTMLElement;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        undoFromShortcut();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MapTopBar
        actions={
          <>
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
          </>
        }
        current="edit"
        info={
          <span className="truncate">
            {mapContent.modelLabel} · {mapContent.versionPrefix}
            {version}
            {model.title ? ` · ${model.title}` : null}
          </span>
        }
      />
      <AddMenu
        furnitureLabel={furnitureLabel}
        onFurnitureLabelChange={setFurnitureLabel}
        onPick={setPlacing}
        placing={placing}
      />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <CanvasViewport
            contentHeight={heightPx}
            contentWidth={widthPx * 2 + gap}
            grid={{
              originX: widthPx + gap + editorGrid.origin.x,
              originY: editorGrid.origin.y,
              step: editorGrid.step,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- API-served plan */}
            <img
              alt={mapContent.planAlt}
              className="absolute left-0 top-0"
              src={`${API_URL}/projects/${projectId}/plan`}
              style={{ height: heightPx, width: widthPx }}
            />
            <div className="absolute top-0" style={{ left: widthPx + gap }}>
              <EditCanvas
                key={placing ?? "select"}
                model={model}
                onCancelPlace={() => setPlacing(null)}
                onGridChange={handleGridChange}
                onMove={(id, dx, dy) =>
                  void apply(withConfirm(id, [{ op: "move", id, dx, dy }]))
                }
                onPlaceLine={(a, b) => {
                  if (placing !== "wall" && placing !== "path" && placing !== "road") {
                    return;
                  }
                  const operation =
                    placing === "path"
                      ? pathElement(a, b)
                      : placing === "road"
                        ? roadElement(a, b, model)
                        : lineElement(a, b, model);
                  setPlacing(null);
                  void apply([operation]).then(() =>
                    setSelectedId(operation.element.id)
                  );
                }}
                onPlaceOpening={(at, width, wallId) => {
                  if (placing !== "door") return;
                  const operation = doorElement(at, width, wallId);
                  setPlacing(null);
                  void apply([operation]).then(() =>
                    setSelectedId(operation.element.id)
                  );
                }}
                onPlacePoint={(at) => {
                  if (
                    !placing ||
                    placing === "door" ||
                    placing === "room" ||
                    placing === "furniture" ||
                    placing === "wall" ||
                    placing === "path" ||
                    placing === "road"
                  ) {
                    return;
                  }
                  const operation = pointElement(placing, at, model);
                  setPlacing(null);
                  void apply([operation]).then(() =>
                    setSelectedId(operation.element.id)
                  );
                }}
                onPlacePolygon={(points) => {
                  if (placing !== "furniture") return;
                  const shouldFocusLabel = furnitureLabel.trim() === "";
                  const operation = furnitureElement(points, furnitureLabel);
                  setPlacing(null);
                  setFurnitureLabel("");
                  void apply([operation]).then(() => {
                    setSelectedId(operation.element.id);
                    setFocusLabelId(
                      shouldFocusLabel ? operation.element.id : null
                    );
                  });
                }}
                onPlaceRect={(a, b) => {
                  if (placing !== "room") return;
                  const operation = roomElement(a, b);
                  setPlacing(null);
                  void apply([operation]).then(() =>
                    setSelectedId(operation.element.id)
                  );
                }}
                onReshape={(id, points) =>
                  void apply(withConfirm(id, [{ op: "reshape", id, points }]))
                }
                onResizeOpening={(id, at, width) =>
                  void apply(
                    withConfirm(id, [
                      { op: "resize-opening", id, at, width },
                    ])
                  )
                }
                onSelect={setSelectedId}
                placing={placing ? placeModeFor(placing) : null}
                selectedId={selectedId}
              />
            </div>
          </CanvasViewport>
        </div>
        <aside className="flex w-80 min-h-0 shrink-0 flex-col border-l bg-card">
          {selected && (
            <div className="border-b">
              <SelectionCard
                autoFocusLabel={focusLabelId === selected.id}
                element={selected}
                key={selected.id}
                onConfirm={(id) => void apply([{ op: "confirm", id }])}
                onDelete={(id) => {
                  setSelectedId(null);
                  void apply([{ op: "delete", id }]);
                }}
                onLabelFocus={() => setFocusLabelId(null)}
                onRelabel={(id, label) =>
                  void apply(withConfirm(id, [{ op: "relabel", id, label }]))
                }
              />
            </div>
          )}
          {reviewElements.length > 0 && (
            <div className="max-h-[40%] overflow-y-auto border-b p-3">
              <ReviewPanel
                elements={reviewElements}
                onConfirmAll={() =>
                  void apply(
                    reviewElements.map(({ id }) => ({ op: "confirm", id }))
                  )
                }
                onConfirm={(id) => void apply([{ op: "confirm", id }])}
                onSelect={setSelectedId}
                selectedId={selectedId}
              />
            </div>
          )}
          <div className="min-h-0 flex-1">
            <PromptPanel
              onApplied={(nextModel, savedVersion) => {
                setUndoStack((stack) => [
                  ...stack.slice(-(UNDO_LIMIT - 1)),
                  model,
                ]);
                setModel(nextModel);
                setVersion(savedVersion);
                setSelectedId(null);
              }}
              projectId={projectId}
              selectedId={selectedId}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
