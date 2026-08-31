"use client";

import { useEffect, useRef, useState } from "react";
import {
  findElement,
  orthogonalizeNearRectangle,
  type FloorModel,
  type Opening,
  type Point,
  type Wall,
} from "@bumps/floor-model";
import { FeatureGlyph } from "@/components/map/feature-glyph";
import {
  constrainWallEnd,
  editorGridStep,
  fitEditorLabel,
  gridOriginForWall,
  gridOriginForWalls,
  nearestWall,
  polygonArea,
  polygonSelfIntersects,
  resizePolygonEdge,
  resizePolygonVertex,
  snapPoint,
  wallAngleDegrees,
  wallOpeningFromDrag,
  wallOpeningSpan,
} from "@/components/map/editor-geometry";
import { cn } from "@/lib/utils";
import { mapContent } from "@/data/map";

const DRAG_THRESHOLD_PX = 3;

type DragState = {
  id: string;
  kind: "edge" | "element" | "opening-end" | "vertex";
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  // For vertex drags: which point of the wall/room polygon.
  vertexIndex: number;
};

// Furniture uses click-to-outline polygons; rooms remain quick rectangles.
export type PlaceMode =
  | "line"
  | "opening"
  | "point"
  | "polygon"
  | "rect"
  | "wall";

type EditCanvasProps = {
  model: FloorModel;
  onCancelPlace: () => void;
  onGridChange: (origin: Point, step: number) => void;
  onPlaceLine: (a: Point, b: Point) => void;
  onPlaceOpening: (at: Point, width: number, wallId: string) => void;
  onPlacePoint: (at: Point) => void;
  onPlacePolygon: (points: Point[]) => void;
  onPlaceRect: (a: Point, b: Point) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onReshape: (id: string, points: Point[]) => void;
  onResizeOpening: (id: string, at: Point, width: number) => void;
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
  onCancelPlace,
  onGridChange,
  onMove,
  onPlaceLine,
  onPlaceOpening,
  onPlacePoint,
  onPlacePolygon,
  onPlaceRect,
  onReshape,
  onResizeOpening,
  onSelect,
  placing,
  selectedId,
}: EditCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [delta, setDelta] = useState<Point>({ x: 0, y: 0 });
  const [draw, setDraw] = useState<{
    end: Point;
    start: Point;
    wallId?: string;
  } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([]);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [snapWallId, setSnapWallId] = useState<string | null>(null);

  const { heightPx, widthPx } = model.plan;
  const planBounds = { height: heightPx, width: widthPx };
  const gridStep = editorGridStep(widthPx);
  const gridOrigin = gridOriginForWalls(model.walls, gridStep);
  const alignedWall = model.walls.find(
    (wall) => wall.id === (draw?.wallId ?? snapWallId)
  );
  const displayGridOrigin = alignedWall
    ? gridOriginForWall(gridOrigin, alignedWall, gridStep)
    : gridOrigin;
  const displayGridX = displayGridOrigin.x;
  const displayGridY = displayGridOrigin.y;

  useEffect(() => {
    onGridChange({ x: displayGridX, y: displayGridY }, gridStep);
  }, [displayGridX, displayGridY, gridStep, onGridChange]);
  const polygonInvalid = polygonSelfIntersects(polygonPoints);
  const wallSnapTolerance = Math.max(
    gridStep,
    ...model.walls.map((wall) => wall.thickness * 1.5)
  );

  function attachedWall(opening: Opening): Wall | undefined {
    const stated = opening.wallId
      ? model.walls.find((wall) => wall.id === opening.wallId)
      : undefined;
    if (stated) return stated;
    return nearestWall(
      opening.at,
      model.walls,
      opening.width / 2 + gridStep
    )?.wall;
  }

  function resizeOpeningDraft(
    opening: Opening,
    endIndex: number,
    d: Point
  ) {
    const wall = attachedWall(opening);
    if (!wall) return null;
    const span = wallOpeningSpan(wall, opening);
    const moved = span[endIndex];
    const fixed = span[endIndex === 0 ? 1 : 0];
    if (!moved || !fixed) return null;
    return wallOpeningFromDrag(
      wall,
      fixed,
      { x: moved.x + d.x, y: moved.y + d.y },
      gridStep
    );
  }

  function finishPolygon() {
    if (
      polygonPoints.length < 3 ||
      polygonArea(polygonPoints) < gridStep * gridStep ||
      polygonInvalid
    ) {
      return;
    }
    onPlacePolygon(orthogonalizeNearRectangle(polygonPoints));
    setPolygonPoints([]);
    setCursorPoint(null);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable;
      if (isTyping) return;
      if (event.key === "Escape" && placing) {
        event.preventDefault();
        setDraw(null);
        setPolygonPoints([]);
        setCursorPoint(null);
        setSnapWallId(null);
        onCancelPlace();
      }
      if (event.key === "Enter" && placing === "polygon") {
        event.preventDefault();
        finishPolygon();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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
    const at = toPlan(event.clientX, event.clientY);
    const gridAt = snapPoint(at, gridStep, planBounds, gridOrigin);
    const wallHit =
      placing === "opening" || placing === "wall"
        ? nearestWall(at, model.walls, wallSnapTolerance)
        : null;
    const snappedAt = wallHit?.point ?? gridAt;
    if (placing === "opening" || placing === "wall") {
      setSnapWallId(wallHit?.wall.id ?? draw?.wallId ?? null);
    }
    if (placing === "opening") setCursorPoint(wallHit?.point ?? null);
    else if (placing) setCursorPoint(snappedAt);
    if (draw) {
      if (placing === "opening" && draw.wallId) {
        const wall = model.walls.find((item) => item.id === draw.wallId);
        if (wall) {
          const opening = wallOpeningFromDrag(
            wall,
            draw.start,
            at,
            gridStep
          );
          setDraw({ ...draw, end: opening.end });
        }
        return;
      }
      setDraw({
        ...draw,
        end:
          placing === "wall"
            ? constrainWallEnd(
                draw.start,
                snappedAt,
                gridStep,
                planBounds,
                gridOrigin,
                true
              )
            : snappedAt,
      });
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
    if (element && (element.kind === "door" || element.kind === "window")) {
      const wall = attachedWall(element);
      if (wall) {
        const candidate = snapPoint(
          { x: element.at.x + delta.x, y: element.at.y + delta.y },
          gridStep,
          planBounds,
          gridOrigin
        );
        const projected = nearestWall(
          candidate,
          [wall],
          Number.POSITIVE_INFINITY
        )!.point;
        return {
          x: projected.x - element.at.x,
          y: projected.y - element.at.y,
        };
      }
    }
    const anchor =
      element && "at" in element
        ? element.at
        : element && "a" in element
          ? element.a
          : element && "polygon" in element
            ? element.polygon[0]!
            : element && "points" in element
              ? element.points[0]!
            : { x: 0, y: 0 };
    const points =
      element && "at" in element
        ? [element.at]
        : element && "a" in element
          ? [element.a, element.b]
          : element && "polygon" in element
            ? element.polygon
            : element && "points" in element
              ? element.points
              : [anchor];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const snappedAnchor = snapPoint(
      { x: anchor.x + delta.x, y: anchor.y + delta.y },
      gridStep,
      planBounds,
      gridOrigin
    );
    const raw = {
      x: snappedAnchor.x - anchor.x,
      y: snappedAnchor.y - anchor.y,
    };
    return {
      x: Math.min(widthPx - Math.max(...xs), Math.max(-Math.min(...xs), raw.x)),
      y: Math.min(heightPx - Math.max(...ys), Math.max(-Math.min(...ys), raw.y)),
    };
  }

  // Every edited wall remains on the same eight allowed directions used by
  // new walls, so dragging cannot accidentally introduce a free angle.
  function wallVertexPoints(
    wall: { a: Point; b: Point },
    index: number,
    d: Point
  ): [Point, Point] {
    const moved = index === 0 ? wall.a : wall.b;
    const other = index === 0 ? wall.b : wall.a;
    const snappedOther = other;
    const snappedMoved = constrainWallEnd(
      snappedOther,
      { x: moved.x + d.x, y: moved.y + d.y },
      gridStep,
      planBounds,
      gridOrigin,
      true
    );
    return index === 0
      ? [snappedMoved, snappedOther]
      : [snappedOther, snappedMoved];
  }

  function polygonDragPoints(
    polygon: Point[],
    kind: DragState["kind"],
    index: number,
    d: Point
  ): Point[] {
    if (kind === "edge") {
      return resizePolygonEdge(
        polygon,
        index,
        d,
        gridStep,
        planBounds,
        gridOrigin
      );
    }
    const point = polygon[index];
    if (!point) return polygon;
    return resizePolygonVertex(
      polygon,
      index,
      { x: point.x + d.x, y: point.y + d.y },
      gridStep,
      planBounds,
      gridOrigin
    );
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (draw) {
      const { end, start } = draw;
      setDraw(null);
      if (placing === "opening" && draw.wallId) {
        const wall = model.walls.find((item) => item.id === draw.wallId);
        if (!wall) return;
        const opening = wallOpeningFromDrag(wall, start, end, gridStep);
        if (opening.width >= gridStep) {
          onPlaceOpening(opening.at, opening.width, opening.wallId);
        }
        return;
      }
      const big =
        Math.abs(end.x - start.x) >= gridStep &&
        Math.abs(end.y - start.y) >= gridStep;
      const long =
        Math.hypot(end.x - start.x, end.y - start.y) >= gridStep * 2;
      if (placing === "rect" && big) onPlaceRect(start, end);
      if ((placing === "line" || placing === "wall") && long) {
        onPlaceLine(start, end);
      }
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
      const opening = model.openings.find((item) => item.id === id);
      if (opening) {
        onResizeOpening(
          id,
          {
            x: opening.at.x + finalDelta.x,
            y: opening.at.y + finalDelta.y,
          },
          opening.width
        );
        return;
      }
      onMove(id, finalDelta.x, finalDelta.y);
      return;
    }
    if (kind === "opening-end") {
      const opening = model.openings.find((item) => item.id === id);
      if (!opening) return;
      const resized = resizeOpeningDraft(opening, vertexIndex, rawDelta);
      if (resized && resized.width >= gridStep) {
        onResizeOpening(id, resized.at, resized.width);
      }
      return;
    }
    // Vertex drag → reshape with the updated, grid-snapped point.
    const wall = model.walls.find((w) => w.id === id);
    if (wall) {
      const points = wallVertexPoints(wall, vertexIndex, rawDelta);
      onReshape(id, points);
      return;
    }
    const polyOwner =
      model.rooms.find((r) => r.id === id) ??
      model.furniture.find((f) => f.id === id);
    if (polyOwner) {
      const points = polygonDragPoints(
        polyOwner.polygon,
        kind,
        vertexIndex,
        rawDelta
      );
      if (
        polygonArea(points) < gridStep * gridStep ||
        polygonSelfIntersects(points)
      ) {
        return;
      }
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
    if (wall) return wallVertexPoints(wall, index, delta)[index]!;
    return snapPoint(
      { x: point.x + delta.x, y: point.y + delta.y },
      gridStep,
      planBounds,
      gridOrigin
    );
  };

  const selectedWall = model.walls.find((w) => w.id === selectedId);
  const selectedOpening = model.openings.find((item) => item.id === selectedId);
  const selectedRoom = model.rooms.find((r) => r.id === selectedId);
  const selectedFurniture = model.furniture.find((f) => f.id === selectedId);
  const selectedPolygon = selectedRoom ?? selectedFurniture;
  const selectedPolygonPoints = selectedPolygon
    ? drag &&
      drag.id === selectedPolygon.id &&
      (drag.kind === "edge" || drag.kind === "vertex")
      ? polygonDragPoints(
          selectedPolygon.polygon,
          drag.kind,
          drag.vertexIndex,
          delta
        )
      : orthogonalizeNearRectangle(selectedPolygon.polygon)
    : null;
  const selectedOpeningWall = selectedOpening
    ? attachedWall(selectedOpening)
    : undefined;
  const selectedOpeningPreview =
    selectedOpening &&
    drag?.kind === "opening-end" &&
    drag.id === selectedOpening.id
      ? resizeOpeningDraft(selectedOpening, drag.vertexIndex, delta)
      : null;

  function displayedOpening(opening: Opening): Opening {
    if (selectedOpeningPreview && opening.id === selectedOpening?.id) {
      return {
        ...opening,
        at: selectedOpeningPreview.at,
        width: selectedOpeningPreview.width,
      };
    }
    if (drag?.kind === "element" && drag.id === opening.id && drag.moved) {
      const d = snappedDelta(opening.id);
      return {
        ...opening,
        at: { x: opening.at.x + d.x, y: opening.at.y + d.y },
      };
    }
    return opening;
  }

  const displayedOpenings = model.openings.map(displayedOpening);

  const position = (point: Point) => ({
    left: `${(point.x / widthPx) * 100}%`,
    top: `${(point.y / heightPx) * 100}%`,
  });

  return (
    <div
      className={cn(
        "relative touch-none overflow-hidden bg-transparent",
        placing ? "cursor-crosshair" : "cursor-default"
      )}
      onClick={(event) => {
        if (placing === "point") {
          const at = toPlan(event.clientX, event.clientY);
          onPlacePoint(snapPoint(at, gridStep, planBounds, gridOrigin));
          return;
        }
        if (placing === "polygon") {
          const at = snapPoint(
            toPlan(event.clientX, event.clientY),
            gridStep,
            planBounds,
            gridOrigin
          );
          const first = polygonPoints[0];
          const last = polygonPoints[polygonPoints.length - 1];
          if (first && polygonPoints.length >= 3 && at.x === first.x && at.y === first.y) {
            finishPolygon();
            return;
          }
          if (!last || at.x !== last.x || at.y !== last.y) {
            setPolygonPoints((points) => [...points, at]);
          }
        }
      }}
      onPointerDown={(event) => {
        if (placing === "opening") {
          const at = toPlan(event.clientX, event.clientY);
          const hit = nearestWall(
            at,
            model.walls,
            wallSnapTolerance
          );
          if (hit) {
            setSnapWallId(hit.wall.id);
            setDraw({ end: hit.point, start: hit.point, wallId: hit.wall.id });
          }
          return;
        }
        if (placing === "rect" || placing === "line" || placing === "wall") {
          const at = toPlan(event.clientX, event.clientY);
          const gridStart = snapPoint(
            at,
            gridStep,
            planBounds,
            gridOrigin
          );
          const startWall =
            placing === "wall"
              ? nearestWall(at, model.walls, wallSnapTolerance)
              : undefined;
          const start = startWall?.point ?? gridStart;
          if (startWall) setSnapWallId(startWall.wall.id);
          setDraw({ end: start, start, wallId: startWall?.wall.id });
        }
      }}
      onPointerLeave={() => {
        if (!draw) {
          setCursorPoint(null);
          setSnapWallId(null);
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
          {model.walls.map((wall, index) => {
            const openings = displayedOpenings.filter(
              (opening) => opening.wallId === wall.id
            );
            return (
              <mask
                height={heightPx}
                id={`wall-gaps-${index}`}
                key={`wall-gaps-${wall.id}`}
                maskUnits="userSpaceOnUse"
                width={widthPx}
                x={0}
                y={0}
              >
                <rect fill="white" height={heightPx} width={widthPx} />
                {openings.map((opening) => {
                  const [start, end] = wallOpeningSpan(wall, opening);
                  return (
                    <line
                      key={opening.id}
                      stroke="black"
                      strokeLinecap="butt"
                      strokeWidth={Math.max(wall.thickness + 4, 12)}
                      x1={start.x}
                      x2={end.x}
                      y1={start.y}
                      y2={end.y}
                    />
                  );
                })}
              </mask>
            );
          })}
        </defs>
        {/* Transparent background hit area; CanvasViewport owns the grid. */}
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
              selectedId === room.id && "fill-accent stroke-foreground"
            )}
            key={room.id}
            onPointerDown={(event) => startDrag(event, room.id, "element")}
            points={orthogonalizeNearRectangle(room.polygon)
              .map((p) => `${p.x},${p.y}`)
              .join(" ")}
            strokeWidth={selectedId === room.id ? 4 : 2}
            transform={dragTransform(room.id)}
          />
        ))}
        {model.furniture.map((item) => (
          <polygon
            className={cn(
              "cursor-move fill-muted-foreground/25 stroke-muted-foreground",
              selectedId === item.id && "fill-accent stroke-foreground"
            )}
            key={item.id}
            onPointerDown={(event) => startDrag(event, item.id, "element")}
            points={orthogonalizeNearRectangle(item.polygon)
              .map((p) => `${p.x},${p.y}`)
              .join(" ")}
            strokeWidth={selectedId === item.id ? 3 : 1.5}
            transform={dragTransform(item.id)}
          />
        ))}
        {(model.roads ?? []).map((road) => (
          <polyline
            className={cn(
              "cursor-move fill-none stroke-muted-foreground/50",
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
        {model.walls.map((wall, index) => (
          <line
            className={cn(
              "cursor-move stroke-foreground",
              selectedId === wall.id && "stroke-(--color-brand)"
            )}
            key={wall.id}
            mask={`url(#wall-gaps-${index})`}
            onPointerDown={(event) => startDrag(event, wall.id, "element")}
            strokeLinecap="butt"
            strokeWidth={Math.max(wall.thickness, 8)}
            transform={dragTransform(wall.id)}
            x1={wall.a.x}
            x2={wall.b.x}
            y1={wall.a.y}
            y2={wall.b.y}
          />
        ))}
        {displayedOpenings.map((opening) => (
          <circle
            className={cn(
              "cursor-move fill-transparent",
              opening.kind === "door"
                ? "stroke-(--color-brand)"
                : "stroke-muted-foreground",
              selectedId === opening.id && "stroke-foreground"
            )}
            cx={opening.at.x}
            cy={opening.at.y}
            key={opening.id}
            onPointerDown={(event) => startDrag(event, opening.id, "element")}
            r={opening.width / 2}
            strokeWidth={selectedId === opening.id ? 6 : 4}
          />
        ))}
        {model.features.map((feature) => {
          const dragging =
            drag?.kind === "element" && drag.id === feature.id && drag.moved;
          const d = dragging ? snappedDelta(feature.id) : { x: 0, y: 0 };
          const at = { x: feature.at.x + d.x, y: feature.at.y + d.y };
          const s = Math.max(20, widthPx * 0.03);
          return (
            <g
              className={cn(
                "cursor-move",
                feature.kind === "you-are-here"
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
              {selectedId === feature.id && (
                <circle
                  className="fill-none stroke-current"
                  r={s * 0.85}
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
        {selectedPolygon && selectedPolygonPoints && (
          <g transform={dragTransform(selectedPolygon.id)}>
            <polygon
              className="pointer-events-none fill-none stroke-foreground"
              points={selectedPolygonPoints
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              strokeWidth={3}
            />
            {selectedPolygonPoints.map((point, index) => {
              const next =
                selectedPolygonPoints[(index + 1) % selectedPolygonPoints.length]!;
              const horizontal =
                Math.abs(next.x - point.x) >= Math.abs(next.y - point.y);
              const cursor = horizontal ? "cursor-ns-resize" : "cursor-ew-resize";
              const midpoint = {
                x: (point.x + next.x) / 2,
                y: (point.y + next.y) / 2,
              };
              return (
                <g key={`edge-${index}`}>
                  <line
                    className={cursor}
                    onPointerDown={(event) =>
                      startDrag(event, selectedPolygon.id, "edge", index)
                    }
                    pointerEvents="stroke"
                    stroke="transparent"
                    strokeWidth={Math.max(18, gridStep * 0.8)}
                    x1={point.x}
                    x2={next.x}
                    y1={point.y}
                    y2={next.y}
                  />
                  <circle
                    className={cn(
                      cursor,
                      "fill-background stroke-foreground"
                    )}
                    cx={midpoint.x}
                    cy={midpoint.y}
                    onPointerDown={(event) =>
                      startDrag(event, selectedPolygon.id, "edge", index)
                    }
                    r={7}
                    strokeWidth={2.5}
                  />
                </g>
              );
            })}
            {selectedPolygonPoints.map((point, index) => (
              <circle
                className="cursor-grab fill-background stroke-foreground"
                cx={point.x}
                cy={point.y}
                key={`vertex-${index}`}
                onPointerDown={(event) =>
                  startDrag(event, selectedPolygon.id, "vertex", index)
                }
                r={10}
                strokeWidth={3}
              />
            ))}
          </g>
        )}
        {selectedOpening && selectedOpeningWall && (
          <g>
            {wallOpeningSpan(
              selectedOpeningWall,
              displayedOpening(selectedOpening)
            ).map((point, index) => {
              const horizontal =
                Math.abs(selectedOpeningWall.b.x - selectedOpeningWall.a.x) >=
                Math.abs(selectedOpeningWall.b.y - selectedOpeningWall.a.y);
              return (
                <g key={`opening-handle-${index}`}>
                  <circle
                    className={horizontal ? "cursor-ew-resize" : "cursor-ns-resize"}
                    cx={point.x}
                    cy={point.y}
                    fill="transparent"
                    onPointerDown={(event) =>
                      startDrag(
                        event,
                        selectedOpening.id,
                        "opening-end",
                        index
                      )
                    }
                    r={18}
                  />
                  <circle
                    className="pointer-events-none fill-background stroke-foreground"
                    cx={point.x}
                    cy={point.y}
                    r={8}
                    strokeWidth={3}
                  />
                </g>
              );
            })}
          </g>
        )}
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
        {draw && placing === "wall" && (
          <g className="pointer-events-none">
            <line
              className="stroke-(--color-brand)"
              strokeDasharray="8 6"
              strokeWidth={6}
              x1={draw.start.x}
              x2={draw.end.x}
              y1={draw.start.y}
              y2={draw.end.y}
            />
            <circle
              className="fill-(--color-brand) stroke-background"
              cx={draw.end.x}
              cy={draw.end.y}
              r={gridStep * 0.22}
              strokeWidth={gridStep * 0.08}
            />
            <text
              className="fill-foreground font-mono"
              fontSize={Math.max(12, gridStep * 0.55)}
              x={draw.end.x + gridStep * 0.4}
              y={draw.end.y - gridStep * 0.4}
            >
              {wallAngleDegrees(draw.start, draw.end)}°
            </text>
          </g>
        )}
        {draw && placing === "opening" && (
          <g className="pointer-events-none">
            <line
              className="stroke-background"
              strokeLinecap="round"
              strokeWidth={14}
              x1={draw.start.x}
              x2={draw.end.x}
              y1={draw.start.y}
              y2={draw.end.y}
            />
            <line
              className="stroke-(--color-brand)"
              strokeLinecap="round"
              strokeWidth={6}
              x1={draw.start.x}
              x2={draw.end.x}
              y1={draw.start.y}
              y2={draw.end.y}
            />
          </g>
        )}
        {placing === "polygon" && polygonPoints.length > 0 && (
          <g className="pointer-events-none">
            <polygon
              className={cn(
                "fill-(--color-brand)/12 stroke-(--color-brand)",
                polygonInvalid && "fill-destructive/10 stroke-destructive"
              )}
              points={[...polygonPoints, ...(cursorPoint ? [cursorPoint] : [])]
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
              strokeDasharray="8 6"
              strokeWidth={3}
            />
            {polygonPoints.map((point, index) => (
              <circle
                className="fill-background stroke-(--color-brand)"
                cx={point.x}
                cy={point.y}
                key={`pending-${point.x}-${point.y}-${index}`}
                r={index === 0 ? gridStep * 0.3 : gridStep * 0.22}
                strokeWidth={gridStep * 0.08}
              />
            ))}
            {polygonInvalid && cursorPoint && (
              <text
                className="fill-destructive font-mono"
                fontSize={Math.max(12, gridStep * 0.55)}
                x={cursorPoint.x + gridStep * 0.4}
                y={cursorPoint.y - gridStep * 0.4}
              >
                {mapContent.edit.polygonInvalid}
              </text>
            )}
          </g>
        )}
        {cursorPoint && placing && placing !== "polygon" && !draw && (
          <circle
            className="pointer-events-none fill-(--color-brand) stroke-background"
            cx={cursorPoint.x}
            cy={cursorPoint.y}
            r={gridStep * 0.22}
            strokeWidth={gridStep * 0.08}
          />
        )}
      </svg>
      {model.rooms
        .filter((room) => room.label !== null)
        .map((room) => {
          const placement = fitEditorLabel(
            orthogonalizeNearRectangle(room.polygon),
            room.label!,
            12,
            centroid(room.polygon)
          );
          if (!placement) return null;
          return (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground"
              key={`label-${room.id}`}
              style={position(placement.point)}
              title={room.label!}
            >
              {placement.text}
            </span>
          );
        })}
      {model.furniture.map((item) => {
        const placement = fitEditorLabel(
          orthogonalizeNearRectangle(item.polygon),
          item.label,
          10,
          centroid(item.polygon)
        );
        if (!placement) return null;
        return (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 font-mono text-[10px] text-foreground/70"
            key={`label-${item.id}`}
            style={position(placement.point)}
            title={item.label}
          >
            {placement.text}
          </span>
        );
      })}
    </div>
  );
}
