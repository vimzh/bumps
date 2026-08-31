"use client";

import { featureKinds, type Feature } from "@bumps/floor-model";
import {
  DoorOpen,
  Grid3X3,
  Milestone,
  Minus,
  MoreHorizontal,
  RectangleHorizontal,
  Route,
  Sofa,
  Square,
  type LucideIcon,
} from "lucide-react";
import { FEATURE_ICON } from "@/components/map/feature-icons";
import type { PlaceMode } from "@/components/map/edit-canvas";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { mapContent } from "@/data/map";

export type PlaceableKind =
  | Feature["kind"]
  | "door"
  | "furniture"
  | "path"
  | "road"
  | "room"
  | "wall"
  | "window";

export function placeModeFor(kind: PlaceableKind): PlaceMode {
  if (kind === "door") return "opening";
  if (kind === "furniture") return "polygon";
  if (kind === "room") return "rect";
  if (kind === "wall") return "wall";
  if (kind === "path" || kind === "road") return "line";
  return "point";
}

const PRIMARY_TOOLS: { icon: LucideIcon; kind: PlaceableKind }[] = [
  { icon: Minus, kind: "wall" },
  { icon: Sofa, kind: "furniture" },
  { icon: Square, kind: "room" },
  { icon: DoorOpen, kind: "door" },
];

const MORE_STRUCTURAL: { icon: LucideIcon; kind: PlaceableKind }[] = [
  { icon: RectangleHorizontal, kind: "window" },
  { icon: Route, kind: "path" },
  { icon: Milestone, kind: "road" },
];

type AddMenuProps = {
  furnitureLabel: string;
  onFurnitureLabelChange: (label: string) => void;
  onPick: (kind: PlaceableKind | null) => void;
  placing: PlaceableKind | null;
};

function toolLabel(kind: PlaceableKind): string {
  return kind === "furniture"
    ? mapContent.edit.furnitureAreaLabel
    : mapContent.edit.kinds[kind];
}

function placementHint(kind: PlaceableKind): string {
  const mode = placeModeFor(kind);
  if (mode === "opening") return mapContent.edit.doorHint;
  if (mode === "polygon") return mapContent.edit.polygonHint;
  if (mode === "point") return mapContent.edit.paletteHint;
  if (mode === "wall") return mapContent.edit.wallHint;
  return mapContent.edit.paletteDragHint;
}

export function AddMenu({
  furnitureLabel,
  onFurnitureLabelChange,
  onPick,
  placing,
}: AddMenuProps) {
  return (
    <div
      aria-label={mapContent.edit.paletteTitle}
      className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3"
      role="toolbar"
    >
      <span className="mr-1 text-xs font-medium text-muted-foreground">
        {mapContent.edit.paletteTitle}
      </span>
      {PRIMARY_TOOLS.map(({ icon: Icon, kind }) => {
        const active = placing === kind;
        return (
          <Button
            aria-pressed={active}
            className="h-8 cursor-pointer rounded-sm px-3 text-xs"
            key={kind}
            onClick={() => onPick(active ? null : kind)}
            size="sm"
            type="button"
            variant={active ? "default" : "outline"}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {toolLabel(kind)}
          </Button>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-8 cursor-pointer rounded-sm px-3 text-xs"
            size="sm"
            type="button"
            variant="outline"
          >
            <MoreHorizontal aria-hidden="true" className="size-3.5" />
            {mapContent.edit.moreToolsLabel}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="rounded-sm">
          {MORE_STRUCTURAL.map(({ icon: Icon, kind }) => (
            <DropdownMenuItem
              className="cursor-pointer text-xs"
              key={kind}
              onSelect={() => onPick(kind)}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {toolLabel(kind)}
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
                <Icon aria-hidden="true" className="size-3.5" />
                {mapContent.edit.kinds[kind]}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {placing === "furniture" && (
        <Input
          aria-label={mapContent.edit.furnitureLabelInput}
          className="ml-2 h-8 w-44 rounded-sm text-sm"
          maxLength={200}
          onChange={(event) => onFurnitureLabelChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onPick(null);
            }
          }}
          placeholder={mapContent.edit.furnitureLabelPlaceholder}
          value={furnitureLabel}
        />
      )}

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {placing && (
          <p className="max-w-md truncate text-xs text-foreground" role="status">
            {placementHint(placing)}
            <span className="ml-2 text-muted-foreground">
              {mapContent.edit.cancelHint}
            </span>
          </p>
        )}
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Grid3X3 aria-hidden="true" className="size-3.5" />
          {mapContent.edit.snapStatus}
        </span>
      </div>
    </div>
  );
}
