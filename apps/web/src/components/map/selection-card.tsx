"use client";

import { useEffect, useState } from "react";
import type { FloorElement } from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapContent } from "@/data/map";

type SelectionCardProps = {
  element: FloorElement;
  onConfirm: (id: string) => void;
  onDelete: (id: string) => void;
  onRelabel: (id: string, label: string | null) => void;
};

export function SelectionCard({
  element,
  onConfirm,
  onDelete,
  onRelabel,
}: SelectionCardProps) {
  const isRoom = element.kind === "room";
  const [label, setLabel] = useState(isRoom ? (element.label ?? "") : "");

  useEffect(() => {
    setLabel(element.kind === "room" ? (element.label ?? "") : "");
  }, [element]);

  function commitLabel() {
    if (element.kind !== "room") return;
    const next = label.trim() === "" ? null : label.trim();
    if (next !== element.label) {
      onRelabel(element.id, next);
    }
  }

  return (
    <div className="rounded-sm border bg-card p-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {mapContent.edit.selectionTitle}
      </h2>
      <p className="mt-1 font-mono text-xs">
        {mapContent.edit.kinds[element.kind]} · {element.id} ·{" "}
        {mapContent.edit.confidencePrefix} {element.confidence.toFixed(2)}
      </p>
      {isRoom && (
        <Input
          className="mt-2 h-8 rounded-sm text-sm"
          onBlur={commitLabel}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          placeholder={mapContent.edit.labelPlaceholder}
          value={label}
        />
      )}
      <div className="mt-2 flex gap-2">
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
