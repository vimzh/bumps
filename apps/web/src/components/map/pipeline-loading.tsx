"use client";

import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { mapContent } from "@/data/map";

// Centered loading state for the long pipeline stages (parse, tactile
// conversion, STL export). Real stage transitions set the floor/ceiling
// window; within a window the bar creeps asymptotically so a multi-minute
// model call never looks stalled, and it can never claim a stage that
// hasn't actually happened.

export function useCreepingPercent(
  floor: number,
  ceiling: number,
  active: boolean
): number {
  const [crept, setCrept] = useState(0);
  useEffect(() => {
    if (!active) {
      return;
    }
    const interval = setInterval(() => {
      setCrept((current) => {
        const base = Math.max(current, floor);
        return Math.min(ceiling - 0.5, base + (ceiling - base) * 0.035);
      });
    }, 400);
    return () => clearInterval(interval);
  }, [active, ceiling, floor]);
  return Math.min(Math.max(crept, floor), 100);
}

type PipelineLoadingProps = {
  /** Current activity, shown under the bar. */
  detail: string;
  /** Optional expectation-setting line at the very bottom. */
  hint?: string;
  percent: number;
  /** Completed pass summaries (newest last), shown as small mono lines. */
  steps?: string[];
  title: string;
};

export function PipelineLoading({
  detail,
  hint,
  percent,
  steps,
  title,
}: PipelineLoadingProps) {
  const shown = Math.min(99, Math.round(percent));
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <h2 className="text-shimmer font-pixel text-2xl tracking-tight">
          {title}
        </h2>
        <div className="w-full">
          <Progress
            aria-label={title}
            className="h-1.5 bg-foreground/10"
            value={shown}
          />
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <p
              aria-live="polite"
              className="min-w-0 flex-1 text-left text-xs text-muted-foreground"
            >
              {detail}
            </p>
            <p className="shrink-0 font-mono text-xs text-foreground tabular-nums">
              {shown}
              {mapContent.loading.percentSuffix}
            </p>
          </div>
        </div>
        {steps && steps.length > 0 && (
          <ol className="flex flex-col gap-1 font-mono text-[11px] leading-4 text-muted-foreground/70">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
        {hint && (
          <p className="text-xs text-muted-foreground/70">{hint}</p>
        )}
      </div>
    </div>
  );
}
