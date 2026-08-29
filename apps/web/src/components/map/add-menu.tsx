"use client";

import { featureKinds, type Feature } from "@bumps/floor-model";
import {

  DoorOpen,
  Minus,
  Plus,
  RectangleHorizontal,
  Sofa,
  Square,
  type LucideIcon,
  Route,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FEATURE_ICON } from "@/components/map/feature-icons";
import type { PlaceMode } from "@/components/map/edit-canvas";
import { mapContent } from "@/data/map";

export type PlaceableKind =
  | Feature["kind"]
  | "door"
  | "furniture"
  | "path"
  | "room"
  | "wall"
  | "window";

// Rooms, furniture, and walls are drawn (drag); everything else is a click.
export function placeModeFor(kind: PlaceableKind): PlaceMode {
  if (kind === "room" || kind === "furniture") return "rect";
  if (kind === "wall" || kind === "path") return "line";
  return "point";
}

const STRUCTURAL: { icon: LucideIcon; kind: PlaceableKind }[] = [
  { icon: DoorOpen, kind: "door" },
  { icon: RectangleHorizontal, kind: "window" },
  { icon: Minus, kind: "wall" },
  { icon: Route, kind: "path" },
  { icon: Square, kind: "room" },
  { icon: Sofa, kind: "furniture" },
];

type AddMenuProps = {
  onPick: (kind: PlaceableKind | null) => void;
  placing: PlaceableKind | null;
};

export function AddMenu({ onPick, placing }: AddMenuProps) {
  if (placing) {
    return (
      <Button
        className="cursor-pointer rounded-sm shadow-sm"
        onClick={() => onPick(null)}
        size="sm"
        type="button"
      >
        {mapContent.edit.kinds[placing]} —{" "}
        {placeModeFor(placing) === "point"
          ? mapContent.edit.paletteHint
          : mapContent.edit.paletteDragHint}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="cursor-pointer rounded-sm shadow-sm"
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-3.5" />
          {mapContent.edit.addLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-sm">
        {STRUCTURAL.map(({ icon: Icon, kind }) => (
          <DropdownMenuItem
            className="cursor-pointer text-xs"
            key={kind}
            onSelect={() => onPick(kind)}
          >
            <Icon className="size-3.5" />
            {mapContent.edit.kinds[kind]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {featureKinds.map((kind) => {
          const Icon = FEATURE_ICON[kind];
          return (
            <DropdownMenuItem
              className="cursor-pointer text-xs"
              key={kind}
              onSelect={() => onPick(kind)}
            >
              <Icon className="size-3.5" />
              {mapContent.edit.kinds[kind]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
