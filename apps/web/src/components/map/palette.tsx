"use client";

import { featureKinds, type Feature } from "@bumps/floor-model";
import {
  DoorOpen,
  Minus,
  RectangleHorizontal,
  Square,
  type LucideIcon,
} from "lucide-react";
import { FEATURE_ICON } from "@/components/map/feature-icons";
import { mapContent } from "@/data/map";
import { cn } from "@/lib/utils";

export type PlaceableKind = Feature["kind"] | "door" | "room" | "wall" | "window";

const STRUCTURAL: { icon: LucideIcon; kind: PlaceableKind }[] = [
  { icon: DoorOpen, kind: "door" },
  { icon: RectangleHorizontal, kind: "window" },
  { icon: Minus, kind: "wall" },
  { icon: Square, kind: "room" },
];

type PaletteProps = {
  onPick: (kind: PlaceableKind | null) => void;
  placing: PlaceableKind | null;
};

export function Palette({ onPick, placing }: PaletteProps) {
  const entries: { icon: LucideIcon; kind: PlaceableKind }[] = [
    ...STRUCTURAL,
    ...featureKinds.map((kind) => ({ icon: FEATURE_ICON[kind], kind })),
  ];
  return (
    <div>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {mapContent.edit.paletteTitle}
      </h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entries.map(({ icon: Icon, kind }) => (
          <button
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-sm border px-2 py-1 text-xs transition-colors",
              placing === kind
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-foreground hover:border-foreground/40"
            )}
            key={kind}
            onClick={() => onPick(placing === kind ? null : kind)}
            title={mapContent.edit.kinds[kind]}
            type="button"
          >
            <Icon className="size-3.5" />
            {mapContent.edit.kinds[kind]}
          </button>
        ))}
      </div>
      {placing && (
        <p className="mt-2 text-xs text-muted-foreground">
          {mapContent.edit.paletteHint}
        </p>
      )}
    </div>
  );
}
