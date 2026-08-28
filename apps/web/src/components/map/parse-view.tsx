"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";

type ParseStatus = "failed" | "parsed" | "parsing" | "uploaded";

type ParseProgress = {
  aggregateConfidence: number | null;
  history: {
    aggregateConfidence: number;
    findingsCount: number;
    iteration: number;
    majorCount: number;
    verdict: "needs_refinement" | "pass";
  }[];
  iteration: number;
  maxIterations: number;
  stage: "critiquing" | "parsing" | "refining";
};

type ParseViewProps = {
  initialError: string | null;
  initialProgress: ParseProgress | null;
  initialStatus: ParseStatus;
  projectId: string;
  projectName: string;
};

export function ParseView({
  initialError,
  initialProgress,
  initialStatus,
  projectId,
  projectName,
}: ParseViewProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ParseStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [progress, setProgress] = useState<ParseProgress | null>(
    initialProgress
  );

  useEffect(() => {
    if (status !== "parsing") {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/projects/${projectId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const project = (await response.json()) as {
          parseError: string | null;
          parseProgress: ParseProgress | null;
          status: ParseStatus;
        };
        if (project.status === "parsed") {
          router.refresh();
        } else if (project.status !== "parsing") {
          setStatus(project.status);
          setError(project.parseError);
          setProgress(null);
        } else {
          setProgress(project.parseProgress);
        }
      } catch {
        // Transient poll failure; keep polling.
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [projectId, router, status]);

  async function startParse() {
    setError(null);
    try {
      const response = await fetch(`${API_URL}/projects/${projectId}/parse`, {
        method: "POST",
      });
      if (!response.ok && response.status !== 409) {
        throw new Error(`Parse start failed with status ${response.status}`);
      }
      setStatus("parsing");
    } catch {
      setError(mapContent.parse.startFailed);
    }
  }

  return (
    <section className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <header className="text-center">
        <p className="text-sm text-muted-foreground">
          {mapContent.uploadedLabel}
        </p>
        <h1 className="mt-1 font-mono text-base">{projectName}</h1>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element -- API-served image, dimensions unknown */}
      <img
        alt={mapContent.planAlt}
        className="max-h-[55dvh] w-auto max-w-full border"
        src={`${API_URL}/projects/${projectId}/plan`}
      />
      <div aria-live="polite" className="flex flex-col items-center gap-2">
        {status === "parsing" ? (
          <>
            <p className="animate-pulse text-sm text-muted-foreground">
              {progress
                ? `${mapContent.parse.passLabel} ${progress.iteration}/${progress.maxIterations} · ${mapContent.parse.stages[progress.stage]}`
                : mapContent.parse.parsingHint}
            </p>
            {progress?.history.map((entry) => (
              <p
                className="font-mono text-xs text-muted-foreground"
                key={entry.iteration}
              >
                {mapContent.parse.passLabel.toLowerCase()} {entry.iteration}:{" "}
                {entry.findingsCount} {mapContent.parse.findingsSuffix} ·{" "}
                {mapContent.parse.confidenceLabel}{" "}
                {entry.aggregateConfidence.toFixed(2)}
              </p>
            ))}
          </>
        ) : (
          <>
            {(status === "failed" || error) && (
              <p className="max-w-md text-center text-sm text-destructive">
                {error
                  ? status === "failed"
                    ? `${mapContent.parse.failedLead} ${error}`
                    : error
                  : null}
              </p>
            )}
            <Button
              className="cursor-pointer rounded-md"
              onClick={() => void startParse()}
              type="button"
            >
              {status === "failed"
                ? mapContent.parse.retryLabel
                : mapContent.parse.parseLabel}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
