"use client";

type PipelineLoadingProps = {
  /** Current activity, shown under the bar. */
  detail: string;
  /** Optional expectation-setting line at the very bottom. */
  hint?: string;
  /** Completed pass summaries (newest last), shown as small mono lines. */
  steps?: string[];
  title: string;
};

export function PipelineLoading({
  detail,
  hint,
  steps,
  title,
}: PipelineLoadingProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <h2 className="text-2xl font-medium tracking-tight">
          {title}
        </h2>
        <div className="w-full">
          <div
            aria-label={title}
            className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
            role="progressbar"
          >
            <div className="h-full w-full animate-pulse bg-foreground/70" />
          </div>
          <div className="mt-3">
            <p
              aria-live="polite"
              className="text-left text-xs text-muted-foreground"
            >
              {detail}
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
