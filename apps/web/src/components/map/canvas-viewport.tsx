"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mapContent } from "@/data/map";

const MAX_SCALE = 8;
const ZOOM_STEP = 1.25;

type Transform = { scale: number; tx: number; ty: number };

type CanvasViewportProps = {
  children: ReactNode;
  contentHeight: number;
  contentWidth: number;
};

// Figma-style viewport: pinch / ctrl+wheel zooms toward the cursor, plain
// wheel (trackpad two-finger) pans, floating buttons zoom and re-fit.
export function CanvasViewport({
  children,
  contentHeight,
  contentWidth,
}: CanvasViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform | null>(null);
  const minScaleRef = useRef(0.05);

  const fit = useCallback(() => {
    const container = containerRef.current;
    if (!container || contentWidth <= 0 || contentHeight <= 0) return;
    const rect = container.getBoundingClientRect();
    const margin = 24;
    const scale = Math.min(
      (rect.width - margin * 2) / contentWidth,
      (rect.height - margin * 2) / contentHeight
    );
    minScaleRef.current = scale * 0.4;
    setTransform({
      scale,
      tx: (rect.width - contentWidth * scale) / 2,
      ty: (rect.height - contentHeight * scale) / 2,
    });
  }, [contentHeight, contentWidth]);

  useLayoutEffect(() => {
    fit();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      // Re-fit only if never fitted; otherwise keep the user's view.
      setTransform((current) => {
        if (current === null) fit();
        return current;
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fit]);

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    setTransform((current) => {
      if (!current) return current;
      const scale = Math.min(
        MAX_SCALE,
        Math.max(minScaleRef.current, current.scale * factor)
      );
      const ratio = scale / current.scale;
      return {
        scale,
        tx: cx - (cx - current.tx) * ratio,
        ty: cy - (cy - current.ty) * ratio,
      };
    });
  }

  function zoomCenter(factor: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden overscroll-contain rounded-sm border bg-muted/40"
      onWheel={(event) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.01));
        } else {
          setTransform((current) =>
            current
              ? {
                  ...current,
                  tx: current.tx - event.deltaX,
                  ty: current.ty - event.deltaY,
                }
              : current
          );
        }
      }}
      ref={containerRef}
    >
      {transform && (
        <div
          className="absolute left-0 top-0"
          style={{
            height: contentHeight,
            transform: `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
            width: contentWidth,
          }}
        >
          {children}
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <Button
          aria-label={mapContent.viewport.zoomIn}
          className="size-7 cursor-pointer rounded-sm p-0"
          onClick={() => zoomCenter(ZOOM_STEP)}
          size="sm"
          type="button"
          variant="outline"
        >
          <ZoomIn className="size-3.5" />
        </Button>
        <Button
          aria-label={mapContent.viewport.zoomOut}
          className="size-7 cursor-pointer rounded-sm p-0"
          onClick={() => zoomCenter(1 / ZOOM_STEP)}
          size="sm"
          type="button"
          variant="outline"
        >
          <ZoomOut className="size-3.5" />
        </Button>
        <Button
          aria-label={mapContent.viewport.fit}
          className="size-7 cursor-pointer rounded-sm p-0"
          onClick={fit}
          size="sm"
          type="button"
          variant="outline"
        >
          <Maximize className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
