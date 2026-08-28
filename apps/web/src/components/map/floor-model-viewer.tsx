import {
  NEEDS_REVIEW_THRESHOLD,
  type FloorModel,
  type Point,
  type Room,
} from "@bumps/floor-model";
import { FEATURE_ICON } from "@/components/map/feature-icons";
import { cn } from "@/lib/utils";

function centroid(polygon: Point[]): Point {
  const sum = polygon.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / polygon.length, y: sum.y / polygon.length };
}

type FloorModelViewerProps = {
  model: FloorModel;
};

export function FloorModelViewer({ model }: FloorModelViewerProps) {
  const { heightPx, widthPx } = model.plan;
  const position = (point: Point) => ({
    left: `${(point.x / widthPx) * 100}%`,
    top: `${(point.y / heightPx) * 100}%`,
  });
  const labeledRooms = model.rooms.filter(
    (room): room is Room & { label: string } => room.label !== null
  );

  return (
    <div
      className="relative w-full overflow-hidden rounded-sm border bg-card"
      style={{ aspectRatio: `${widthPx} / ${heightPx}` }}
    >
      <svg
        aria-hidden
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${widthPx} ${heightPx}`}
      >
        {model.rooms.map((room) => (
          <polygon
            className={cn(
              "fill-muted stroke-border",
              room.confidence < NEEDS_REVIEW_THRESHOLD &&
                "stroke-destructive [stroke-dasharray:8_6]"
            )}
            key={room.id}
            points={room.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
            strokeWidth={room.confidence < NEEDS_REVIEW_THRESHOLD ? 4 : 2}
          />
        ))}
        {model.walls.map((wall) => (
          <line
            className="stroke-foreground"
            key={wall.id}
            strokeLinecap="square"
            strokeWidth={wall.thickness}
            x1={wall.a.x}
            x2={wall.b.x}
            y1={wall.a.y}
            y2={wall.b.y}
          />
        ))}
        {model.openings.map((opening) => (
          <circle
            className={cn(
              "fill-none",
              opening.kind === "door"
                ? "stroke-(--color-brand)"
                : "stroke-muted-foreground",
              opening.confidence < NEEDS_REVIEW_THRESHOLD &&
                "stroke-destructive [stroke-dasharray:5_4]"
            )}
            cx={opening.at.x}
            cy={opening.at.y}
            key={opening.id}
            r={opening.width / 2}
            strokeWidth={4}
          />
        ))}
      </svg>
      {labeledRooms.map((room) => (
        <span
          className="absolute -translate-x-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground"
          key={`label-${room.id}`}
          style={position(centroid(room.polygon))}
        >
          {room.label}
        </span>
      ))}
      {model.features.map((feature) => {
        const Icon = FEATURE_ICON[feature.kind];
        return (
          <span
            className={cn(
              "absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border bg-background text-foreground",
              feature.confidence < NEEDS_REVIEW_THRESHOLD &&
                "border-dashed border-destructive text-destructive"
            )}
            key={feature.id}
            style={position(feature.at)}
            title={feature.kind}
          >
            <Icon aria-label={feature.kind} className="size-4" />
          </span>
        );
      })}
    </div>
  );
}
