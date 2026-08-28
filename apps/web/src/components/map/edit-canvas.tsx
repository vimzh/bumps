"use client";

import { useRef, useState } from "react";
import {
  NEEDS_REVIEW_THRESHOLD,
  type FloorModel,
  type Point,
} from "@bumps/floor-model";
import { FEATURE_ICON } from "@/components/map/feature-icons";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 3;

type DragState = {
  id: string;
  kind: "element" | "vertex";
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  // For vertex drags: which point of the wall/room polygon.
  vertexIndex: number;
};

type EditCanvasProps = {
  model: FloorModel;
  onCanvasClick: (at: Point) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onReshape: (id: string, points: Point[]) => void;
  onSelect: (id: string | null) => void;
  placing: boolean;
  selectedId: string | null;
};

function centroid(polygon: Point[]): Point {
  const sum = polygon.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

export function EditCanvas({
  model,
  onCanvasClick,
  onMove,
  onReshape,
  onSelect,
  placing,
  selectedId,
}: EditCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [delta, setDelta] = useState<Point>({ x: 0, y: 0 });

  const { heightPx, widthPx } = model.plan;

  function toPlan(clientX: number, clientY: number): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * widthPx,
      y: ((clientY - rect.top) / rect.height) * heightPx,
    };
  }

  function planDelta(clientDx: number, clientDy: number): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientDx / rect.width) * widthPx,
      y: (clientDy / rect.height) * heightPx,
    };
  }

  function startDrag(
    event: React.PointerEvent,
    id: string,
    kind: DragState["kind"],
    vertexIndex = -1
  ) {
    if (placing) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id,
      kind,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      vertexIndex,
    });
    setDelta({ x: 0, y: 0 });
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const moved =
      drag.moved ||
      Math.abs(dx) > DRAG_THRESHOLD_PX ||
      Math.abs(dy) > DRAG_THRESHOLD_PX;
    if (moved !== drag.moved) {
      setDrag({ ...drag, moved });
    }
    setDelta(planDelta(dx, dy));
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { id, kind, moved, vertexIndex } = drag;
    const finalDelta = delta;
    setDrag(null);
    setDelta({ x: 0, y: 0 });
    if (!moved) {
      onSelect(id);
      return;
    }
    if (kind === "element") {
      onMove(id, Math.round(finalDelta.x), Math.round(finalDelta.y));
      return;
    }
    // Vertex drag → reshape with the updated point set.
    const wall = model.walls.find((w) => w.id === id);
    if (wall) {
      const points = [wall.a, wall.b].map((p, i) =>
        i === vertexIndex
          ? { x: Math.round(p.x + finalDelta.x), y: Math.round(p.y + finalDelta.y) }
          : p
      );
      onReshape(id, points);
      return;
    }
    const room = model.rooms.find((r) => r.id === id);
    if (room) {
      const points = room.polygon.map((p, i) =>
        i === vertexIndex
          ? { x: Math.round(p.x + finalDelta.x), y: Math.round(p.y + finalDelta.y) }
          : p
      );
      onReshape(id, points);
    }
  }

  const dragTransform = (id: string) =>
    drag?.kind === "element" && drag.id === id && drag.moved
      ? `translate(${delta.x} ${delta.y})`
      : undefined;

  const vertexPreview = (id: string, index: number, point: Point): Point =>
    drag?.kind === "vertex" && drag.id === id && drag.vertexIndex === index
      ? { x: point.x + delta.x, y: point.y + delta.y }
      : point;

  const selectedWall = model.walls.find((w) => w.id === selectedId);
  const selectedRoom = model.rooms.find((r) => r.id === selectedId);

  const position = (point: Point) => ({
    left: `${(point.x / widthPx) * 100}%`,
    top: `${(point.y / heightPx) * 100}%`,
  });

  return (
    <div
      className={cn(
        "relative w-full touch-none overflow-hidden rounded-sm border bg-card",
        placing ? "cursor-crosshair" : "cursor-default"
      )}
      onClick={(event) => {
        if (placing) {
          const at = toPlan(event.clientX, event.clientY);
          onCanvasClick({ x: Math.round(at.x), y: Math.round(at.y) });
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={containerRef}
      style={{ aspectRatio: `${widthPx} / ${heightPx}` }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        onClick={(event) => {
          if (!placing && event.target === event.currentTarget) {
            onSelect(null);
          }
        }}
        preserveAspectRatio="none"
        viewBox={`0 0 ${widthPx} ${heightPx}`}
      >
        {/* Background hit area for deselect */}
        <rect
          fill="transparent"
          height={heightPx}
          onClick={() => {
            if (!placing) onSelect(null);
          }}
          width={widthPx}
        />
        {model.rooms.map((room) => (
          <polygon
            className={cn(
              "cursor-move fill-muted stroke-border",
              room.confidence < NEEDS_REVIEW_THRESHOLD &&
                "stroke-destructive [stroke-dasharray:8_6]",
              selectedId === room.id && "fill-accent stroke-foreground"
            )}
            key={room.id}
            onPointerDown={(event) => startDrag(event, room.id, "element")}
            points={room.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
            strokeWidth={
              selectedId === room.id ||
              room.confidence < NEEDS_REVIEW_THRESHOLD
                ? 4
                : 2
            }
            transform={dragTransform(room.id)}
          />
        ))}
        {model.walls.map((wall) => (
          <line
            className={cn(
              "cursor-move stroke-foreground",
              wall.confidence < NEEDS_REVIEW_THRESHOLD &&
                "stroke-destructive [stroke-dasharray:12_8]",
              selectedId === wall.id && "stroke-(--color-brand)"
            )}
            key={wall.id}
            onPointerDown={(event) => startDrag(event, wall.id, "element")}
            strokeLinecap="square"
            strokeWidth={Math.max(wall.thickness, 8)}
            transform={dragTransform(wall.id)}
            x1={wall.a.x}
            x2={wall.b.x}
            y1={wall.a.y}
            y2={wall.b.y}
          />
        ))}
        {model.openings.map((opening) => (
          <circle
            className={cn(
              "cursor-move fill-transparent",
              opening.kind === "door"
                ? "stroke-(--color-brand)"
                : "stroke-muted-foreground",
              opening.confidence < NEEDS_REVIEW_THRESHOLD &&
                "stroke-destructive [stroke-dasharray:5_4]",
              selectedId === opening.id && "stroke-foreground"
            )}
            cx={opening.at.x}
            cy={opening.at.y}
            key={opening.id}
            onPointerDown={(event) => startDrag(event, opening.id, "element")}
            r={opening.width / 2}
            strokeWidth={selectedId === opening.id ? 6 : 4}
            transform={dragTransform(opening.id)}
          />
        ))}
        {/* Vertex handles for the selected wall or room */}
        {selectedWall &&
          [selectedWall.a, selectedWall.b].map((point, index) => {
            const p = vertexPreview(selectedWall.id, index, point);
            return (
              <circle
                className="cursor-grab fill-background stroke-foreground"
                cx={p.x}
                cy={p.y}
                key={`handle-${index}`}
                onPointerDown={(event) =>
                  startDrag(event, selectedWall.id, "vertex", index)
                }
                r={10}
                strokeWidth={3}
              />
            );
          })}
        {selectedRoom &&
          selectedRoom.polygon.map((point, index) => {
            const p = vertexPreview(selectedRoom.id, index, point);
            return (
              <circle
                className="cursor-grab fill-background stroke-foreground"
                cx={p.x}
                cy={p.y}
                key={`handle-${index}`}
                onPointerDown={(event) =>
                  startDrag(event, selectedRoom.id, "vertex", index)
                }
                r={10}
                strokeWidth={3}
              />
            );
          })}
      </svg>
      {model.rooms
        .filter((room) => room.label !== null)
        .map((room) => (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground"
            key={`label-${room.id}`}
            style={position(centroid(room.polygon))}
          >
            {room.label}
          </span>
        ))}
      {model.features.map((feature) => {
        const Icon = FEATURE_ICON[feature.kind];
        const dragging =
          drag?.kind === "element" && drag.id === feature.id && drag.moved;
        const at = dragging
          ? { x: feature.at.x + delta.x, y: feature.at.y + delta.y }
          : feature.at;
        return (
          <span
            className={cn(
              "absolute flex size-7 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-sm border bg-background text-foreground",
              feature.confidence < NEEDS_REVIEW_THRESHOLD &&
                "border-dashed border-destructive text-destructive",
              selectedId === feature.id && "border-2 border-foreground"
            )}
            key={feature.id}
            onPointerDown={(event) => startDrag(event, feature.id, "element")}
            style={position(at)}
            title={feature.kind}
          >
            <Icon aria-label={feature.kind} className="size-4" />
          </span>
        );
      })}
    </div>
  );
}
