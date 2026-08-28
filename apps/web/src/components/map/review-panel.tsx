"use client";

import type { FloorElement } from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { mapContent } from "@/data/map";
import { cn } from "@/lib/utils";

type ReviewPanelProps = {
  elements: FloorElement[];
  onConfirm: (id: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
};

export function ReviewPanel({
  elements,
  onConfirm,
  onSelect,
  selectedId,
}: ReviewPanelProps) {
  return (
    <div>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {mapContent.edit.reviewTitle} · {elements.length}
      </h2>
      {elements.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {mapContent.edit.reviewEmpty}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {elements.map((element) => {
            const label =
              element.kind === "room" && element.label
                ? element.label
                : element.id;
            return (
              <li className="flex items-center gap-2" key={element.id}>
                <button
                  className={cn(
                    "flex-1 cursor-pointer rounded-sm border px-2 py-1 text-left font-mono text-xs transition-colors",
                    selectedId === element.id
                      ? "border-destructive text-destructive"
                      : "hover:border-foreground/40"
                  )}
                  onClick={() => onSelect(element.id)}
                  type="button"
                >
                  {mapContent.edit.kinds[element.kind]} · {label} ·{" "}
                  {element.confidence.toFixed(2)}
                </button>
                <Button
                  className="h-6 cursor-pointer rounded-sm px-2 text-xs"
                  onClick={() => onConfirm(element.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {mapContent.edit.confirmLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
