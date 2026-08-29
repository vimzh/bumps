"use client";

import { featureKinds, type Feature } from "@bumps/floor-model";
import {
  DoorOpen,
  Minus,
  Plus,
  RectangleHorizontal,
  Square,
  type LucideIcon,
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
import { mapContent } from "@/data/map";

export type PlaceableKind = Feature["kind"] | "door" | "room" | "wall" | "window";

const STRUCTURAL: { icon: LucideIcon; kind: PlaceableKind }[] = [
  { icon: DoorOpen, kind: "door" },
  { icon: RectangleHorizontal, kind: "window" },
  { icon: Minus, kind: "wall" },
  { icon: Square, kind: "room" },
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
        {mapContent.edit.kinds[placing]} — {mapContent.edit.paletteHint}
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
