"use client";

import { useRef, useState } from "react";
import {
  findElement,
  NEEDS_REVIEW_THRESHOLD,
  type FloorModel,
  type Point,
} from "@bumps/floor-model";
import { FeatureGlyph } from "@/components/map/feature-glyph";
import { cn } from "@/lib/utils";

const DRAG_THRESHOLD_PX = 3;

// Grid step as a "nice" number (1/2/5 × 10^n) sized to the plan.
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow;
  }
  return 10 * pow;
}

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

// How a pending placement is drawn: point kinds click, rooms/furniture
// drag corner-to-corner, walls drag end-to-end.
export type PlaceMode = "line" | "point" | "rect";

type EditCanvasProps = {
  model: FloorModel;
  onPlaceLine: (a: Point, b: Point) => void;
  onPlacePoint: (at: Point) => void;
  onPlaceRect: (a: Point, b: Point) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onReshape: (id: string, points: Point[]) => void;
  onSelect: (id: string | null) => void;
  placing: PlaceMode | null;
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
  onMove,
  onPlaceLine,
  onPlacePoint,
  onPlaceRect,
  onReshape,
  onSelect,
  placing,
  selectedId,
}: EditCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [delta, setDelta] = useState<Point>({ x: 0, y: 0 });
  const [draw, setDraw] = useState<{ end: Point; start: Point } | null>(null);

  const { heightPx, widthPx } = model.plan;
  const gridStep = niceStep(widthPx / 60);
  const gridMajor = gridStep * 5;
  const snap = (value: number) => Math.round(value / gridStep) * gridStep;

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
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is a nicety; selection and drags still work without it.
    }
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
    if (draw) {
      const at = toPlan(event.clientX, event.clientY);
      setDraw({ ...draw, end: { x: snap(at.x), y: snap(at.y) } });
      return;
    }
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

  // Live-snapped delta for the dragged element, anchored so the element's
  // reference point lands on grid intersections while dragging.
  function snappedDelta(id: string): Point {
    const element = findElement(model, id);
    const anchor =
      element && "at" in element
        ? element.at
        : element && "a" in element
          ? element.a
          : element && "polygon" in element
            ? element.polygon[0]!
            : { x: 0, y: 0 };
    return {
      x: snap(anchor.x + delta.x) - anchor.x,
      y: snap(anchor.y + delta.y) - anchor.y,
    };
  }

  // Wall endpoints get an orthogonality assist: near-aligned snaps to
  // axis-aligned, since slanted walls are rare and usually mistakes.
  function wallVertexPosition(
    wall: { a: Point; b: Point },
    index: number,
    d: Point
  ): Point {
    const moved = index === 0 ? wall.a : wall.b;
    const other = index === 0 ? wall.b : wall.a;
    const p = { x: snap(moved.x + d.x), y: snap(moved.y + d.y) };
    if (Math.abs(p.x - other.x) <= gridStep) p.x = other.x;
    if (Math.abs(p.y - other.y) <= gridStep) p.y = other.y;
    return p;
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (draw) {
      const { end, start } = draw;
      setDraw(null);
      const big =
        Math.abs(end.x - start.x) >= gridStep &&
        Math.abs(end.y - start.y) >= gridStep;
      const long =
        Math.hypot(end.x - start.x, end.y - start.y) >= gridStep * 2;
      if (placing === "rect" && big) onPlaceRect(start, end);
      if (placing === "line" && long) onPlaceLine(start, end);
      return;
    }
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { id, kind, moved, vertexIndex } = drag;
    const finalDelta = snappedDelta(id);
    const rawDelta = delta;
    setDrag(null);
    setDelta({ x: 0, y: 0 });
    if (!moved) {
      onSelect(id);
      return;
    }
    if (kind === "element") {
      onMove(id, finalDelta.x, finalDelta.y);
      return;
    }
    // Vertex drag → reshape with the updated, grid-snapped point.
    const wall = model.walls.find((w) => w.id === id);
    if (wall) {
      const points = [wall.a, wall.b].map((p, i) =>
        i === vertexIndex ? wallVertexPosition(wall, i, rawDelta) : p
      );
      onReshape(id, points);
      return;
    }
    const polyOwner =
      model.rooms.find((r) => r.id === id) ??
      model.furniture.find((f) => f.id === id);
    if (polyOwner) {
      const points = polyOwner.polygon.map((p, i) =>
        i === vertexIndex
          ? { x: snap(p.x + rawDelta.x), y: snap(p.y + rawDelta.y) }
          : p
      );
      onReshape(id, points);
    }
  }

  const dragTransform = (id: string) => {
    if (!(drag?.kind === "element" && drag.id === id && drag.moved)) {
      return undefined;
    }
    const d = snappedDelta(id);
    return `translate(${d.x} ${d.y})`;
  };

  const vertexPreview = (
    id: string,
    index: number,
    point: Point,
    wall?: { a: Point; b: Point }
  ): Point => {
    if (
      !(drag?.kind === "vertex" && drag.id === id && drag.vertexIndex === index)
    ) {
      return point;
    }
    if (wall) return wallVertexPosition(wall, index, delta);
    return { x: snap(point.x + delta.x), y: snap(point.y + delta.y) };
  };

  const selectedWall = model.walls.find((w) => w.id === selectedId);
  const selectedRoom = model.rooms.find((r) => r.id === selectedId);
  const selectedFurniture = model.furniture.find((f) => f.id === selectedId);

  const position = (point: Point) => ({
    left: `${(point.x / widthPx) * 100}%`,
    top: `${(point.y / heightPx) * 100}%`,
  });

  return (
    <div
      className={cn(
        "relative touch-none overflow-hidden bg-white",
        placing ? "cursor-crosshair" : "cursor-default"
      )}
      onClick={(event) => {
        if (placing === "point") {
          const at = toPlan(event.clientX, event.clientY);
          onPlacePoint({ x: snap(at.x), y: snap(at.y) });
        }
      }}
      onPointerDown={(event) => {
        if (placing === "rect" || placing === "line") {
          const at = toPlan(event.clientX, event.clientY);
          const start = { x: snap(at.x), y: snap(at.y) };
          setDraw({ end: start, start });
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={containerRef}
      style={{ height: heightPx, width: widthPx }}
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
        <defs>
          <pattern
            height={gridStep}
            id="edit-grid-fine"
            patternUnits="userSpaceOnUse"
            width={gridStep}
          >
            <path
              className="stroke-foreground/8"
              d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
              fill="none"
              strokeWidth={gridStep * 0.03}
            />
          </pattern>
          <pattern
            height={gridMajor}
            id="edit-grid-major"
            patternUnits="userSpaceOnUse"
            width={gridMajor}
          >
            <path
              className="stroke-foreground/15"
              d={`M ${gridMajor} 0 L 0 0 0 ${gridMajor}`}
              fill="none"
              strokeWidth={gridStep * 0.05}
            />
          </pattern>
        </defs>
        {/* Grid + background hit area for deselect */}
        <rect
          fill="url(#edit-grid-fine)"
          height={heightPx}
          onClick={() => {
            if (!placing) onSelect(null);
          }}
          width={widthPx}
        />
        <rect
          className="pointer-events-none"
          fill="url(#edit-grid-major)"
          height={heightPx}
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
        {model.furniture.map((item) => (
          <polygon
            className={cn(
              "cursor-move fill-muted-foreground/25 stroke-muted-foreground",
              item.confidence < NEEDS_REVIEW_THRESHOLD &&
                "stroke-destructive [stroke-dasharray:6_5]",
              selectedId === item.id && "fill-accent stroke-foreground"
            )}
            key={item.id}
            onPointerDown={(event) => startDrag(event, item.id, "element")}
            points={item.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
            strokeWidth={
              selectedId === item.id ||
              item.confidence < NEEDS_REVIEW_THRESHOLD
                ? 3
                : 1.5
            }
            transform={dragTransform(item.id)}
          />
        ))}
        {(model.roads ?? []).map((road) => (
          <polyline
            className={cn(
              "cursor-move fill-none stroke-muted-foreground/50",
              road.confidence < NEEDS_REVIEW_THRESHOLD && "stroke-destructive/60",
              selectedId === road.id && "stroke-(--color-brand)/70"
            )}
            key={road.id}
            onPointerDown={(event) => startDrag(event, road.id, "element")}
            points={road.points.map((p) => `${p.x},${p.y}`).join(" ")}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={road.widthPx}
            transform={dragTransform(road.id)}
          />
        ))}
        {(model.paths ?? []).map((path) => (
          <polyline
            className={cn(
              "cursor-move fill-none stroke-foreground/70 [stroke-dasharray:14_10]",
              path.confidence < NEEDS_REVIEW_THRESHOLD && "stroke-destructive",
              selectedId === path.id && "stroke-(--color-brand)"
            )}
            key={path.id}
            onPointerDown={(event) => startDrag(event, path.id, "element")}
            points={path.points.map((p) => `${p.x},${p.y}`).join(" ")}
            strokeLinecap="round"
            strokeWidth={selectedId === path.id ? 10 : 7}
            transform={dragTransform(path.id)}
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
        {model.features.map((feature) => {
          const dragging =
            drag?.kind === "element" && drag.id === feature.id && drag.moved;
          const d = dragging ? snappedDelta(feature.id) : { x: 0, y: 0 };
          const at = { x: feature.at.x + d.x, y: feature.at.y + d.y };
          const s = Math.max(20, widthPx * 0.03);
          const flagged = feature.confidence < NEEDS_REVIEW_THRESHOLD;
          return (
            <g
              className={cn(
                "cursor-move",
                flagged
                  ? "text-destructive"
                  : feature.kind === "you-are-here"
                    ? "text-(--color-brand)"
                    : "text-foreground",
                selectedId === feature.id && "text-(--color-brand)"
              )}
              key={feature.id}
              onPointerDown={(event) => startDrag(event, feature.id, "element")}
              transform={`translate(${at.x} ${at.y})`}
            >
              {/* Invisible hit area so thin linework stays easy to grab */}
              <circle fill="transparent" r={s * 0.8} />
              {(flagged || selectedId === feature.id) && (
                <circle
                  className="fill-none stroke-current"
                  r={s * 0.85}
                  strokeDasharray={flagged ? "5 4" : undefined}
                  strokeWidth={s * 0.06}
                />
              )}
              <FeatureGlyph
                kind={feature.kind}
                rotation={feature.rotation}
                size={s}
              />
            </g>
          );
        })}
        {/* Vertex handles for the selected wall or room */}
        {selectedWall &&
          [selectedWall.a, selectedWall.b].map((point, index) => {
            const p = vertexPreview(selectedWall.id, index, point, selectedWall);
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
        {selectedFurniture &&
          selectedFurniture.polygon.map((point, index) => {
            const p = vertexPreview(selectedFurniture.id, index, point);
            return (
              <circle
                className="cursor-grab fill-background stroke-foreground"
                cx={p.x}
                cy={p.y}
                key={`fhandle-${index}`}
                onPointerDown={(event) =>
                  startDrag(event, selectedFurniture.id, "vertex", index)
                }
                r={10}
                strokeWidth={3}
              />
            );
          })}
        {draw && placing === "rect" && (
          <rect
            className="fill-(--color-brand)/10 stroke-(--color-brand)"
            height={Math.abs(draw.end.y - draw.start.y)}
            strokeDasharray="8 6"
            strokeWidth={3}
            width={Math.abs(draw.end.x - draw.start.x)}
            x={Math.min(draw.start.x, draw.end.x)}
            y={Math.min(draw.start.y, draw.end.y)}
          />
        )}
        {draw && placing === "line" && (
          <line
            className="stroke-(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth={6}
            x1={draw.start.x}
            x2={draw.end.x}
            y1={draw.start.y}
            y2={draw.end.y}
          />
        )}
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
      {model.furniture.map((item) => (
        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] text-foreground/70"
          key={`label-${item.id}`}
          style={position(centroid(item.polygon))}
          title={item.label}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}
