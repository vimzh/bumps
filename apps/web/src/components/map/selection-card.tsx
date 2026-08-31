"use client";

import type { FloorElement } from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapContent } from "@/data/map";

type SelectionCardProps = {
  autoFocusLabel?: boolean;
  element: FloorElement;
  onConfirm: (id: string) => void;
  onDelete: (id: string) => void;
  onLabelFocus?: () => void;
  onRelabel: (id: string, label: string | null) => void;
};

export function SelectionCard({
  autoFocusLabel = false,
  element,
  onConfirm,
  onDelete,
  onLabelFocus,
  onRelabel,
}: SelectionCardProps) {
  const isLabeled = element.kind === "room" || element.kind === "furniture";

  function commitLabel(value: string) {
    if (element.kind === "furniture") {
      const next = value.trim();
      if (next !== "" && next !== element.label) {
        onRelabel(element.id, next);
      }
      return;
    }
    if (element.kind !== "room") return;
    const next = value.trim() === "" ? null : value.trim();
    if (next !== element.label) {
      onRelabel(element.id, next);
    }
  }

  return (
    <div className="p-3">
      <h2 className="text-xs font-medium text-muted-foreground">
        {mapContent.edit.selectionTitle}
      </h2>
      <p className="mt-1 font-mono text-xs">
        {mapContent.edit.kinds[element.kind]} · {element.id} ·{" "}
        {mapContent.edit.confidencePrefix} {element.confidence.toFixed(2)}
      </p>
      {isLabeled && (
        <Input
          aria-label={
            element.kind === "furniture"
              ? mapContent.edit.furnitureLabelInput
              : mapContent.edit.roomLabelInput
          }
          autoFocus={autoFocusLabel}
          className="mt-2 h-8 rounded-sm text-sm"
          defaultValue={element.label ?? ""}
          key={`${element.id}:${element.label ?? ""}`}
          onBlur={(event) => commitLabel(event.currentTarget.value)}
          onFocus={onLabelFocus}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          placeholder={
            element.kind === "furniture"
              ? mapContent.edit.furnitureLabelPlaceholder
              : mapContent.edit.labelPlaceholder
          }
        />
      )}
      <div className="mt-3 flex gap-2">
        {element.confidence < 1 && (
          <Button
            className="h-7 cursor-pointer rounded-sm px-2 text-xs"
            onClick={() => onConfirm(element.id)}
            size="sm"
            type="button"
            variant="outline"
          >
            {mapContent.edit.confirmLabel}
          </Button>
        )}
        <Button
          className="h-7 cursor-pointer rounded-sm px-2 text-xs"
          onClick={() => onDelete(element.id)}
          size="sm"
          type="button"
          variant="destructive"
        >
          {mapContent.edit.deleteLabel}
        </Button>
      </div>
    </div>
  );
}
