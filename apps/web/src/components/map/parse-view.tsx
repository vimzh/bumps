"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CanvasViewport } from "@/components/map/canvas-viewport";
import { MapTopBar } from "@/components/map/map-top-bar";
import { PipelineLoading } from "@/components/map/pipeline-loading";
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
  const [status, setStatus] = useState<ParseStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [progress, setProgress] = useState<ParseProgress | null>(
    initialProgress
  );
  const [planSize, setPlanSize] = useState<{
    height: number;
    width: number;
  } | null>(null);

  // Probe the plan's natural size programmatically: a rendered <img> can
  // finish loading before hydration attaches onLoad and never report it.
  useEffect(() => {
    const probe = new Image();
    probe.onload = () =>
      setPlanSize({ height: probe.naturalHeight, width: probe.naturalWidth });
    probe.src = `${API_URL}/projects/${projectId}/plan`;
    return () => {
      probe.onload = null;
    };
  }, [projectId]);

  useEffect(() => {
    if (status !== "parsing") {
      return;
    }
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
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
          window.location.reload();
          return;
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
      if (!cancelled) {
        timeout = setTimeout(poll, 2000);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [projectId, status]);
  const stageDetail = progress
    ? `${mapContent.parse.passLabel} ${progress.iteration}/${progress.maxIterations} · ${mapContent.parse.stages[progress.stage]}`
    : mapContent.parse.stages.parsing;
  const passSummaries = (progress?.history ?? []).map(
    (entry) =>
      `${mapContent.parse.passLabel.toLowerCase()} ${entry.iteration} · ${entry.findingsCount} ${mapContent.parse.findingsSuffix} · ${mapContent.parse.confidenceLabel} ${entry.aggregateConfidence.toFixed(2)}`
  );

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
    <section className="flex h-dvh flex-col overflow-hidden">
      <MapTopBar
        current="parse"
        info={
          <span className="truncate">
            {mapContent.uploadedLabel} ·{" "}
            <span className="font-mono">{projectName}</span>
          </span>
        }
        actions={
          status !== "parsing" && (
            <div className="flex items-center gap-3">
              {(status === "failed" || error) && (
                <p className="max-w-md text-sm text-destructive">
                  {error
                    ? status === "failed"
                      ? `${mapContent.parse.failedLead} ${error}`
                      : error
                    : null}
                </p>
              )}
              <Button
                className="h-8 cursor-pointer rounded-sm px-3 text-xs"
                onClick={() => void startParse()}
                size="sm"
                type="button"
              >
                {status === "failed"
                  ? mapContent.parse.retryLabel
                  : mapContent.parse.parseLabel}
              </Button>
            </div>
          )
        }
      />
      <div className="relative min-h-0 flex-1 bg-background">
        {status === "parsing" ? (
          <PipelineLoading
            detail={stageDetail}
            hint={mapContent.loading.parse.timeHint}
            steps={passSummaries}
            title={mapContent.loading.parse.title}
          />
        ) : (
          planSize && (
            <CanvasViewport
              contentHeight={planSize.height}
              contentWidth={planSize.width}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- API-served image */}
              <img
                alt={mapContent.planAlt}
                className="h-full w-full"
                src={`${API_URL}/projects/${projectId}/plan`}
              />
            </CanvasViewport>
          )
        )}
      </div>
    </section>
  );
}
