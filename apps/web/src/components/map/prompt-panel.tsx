"use client";

import { useEffect, useRef, useState } from "react";
import type { FloorModel } from "@bumps/floor-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mapContent } from "@/data/map";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

type HistoryEntry = {
  kind: "applied" | "error" | "question";
  prompt: string;
  reply: string;
};

type PromptPanelProps = {
  onApplied: (model: FloorModel, version: number) => void;
  projectId: string;
  selectedId: string | null;
};

export function PromptPanel({
  onApplied,
  projectId,
  selectedId,
}: PromptPanelProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const scrollRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history, busy]);

  async function submit() {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setInput("");
    try {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/model/edit`,
        {
          body: JSON.stringify({ prompt, selectedId }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }
      );
      const payload = (await response.json()) as {
        action?: "applied" | "clarify";
        error?: string;
        model?: FloorModel;
        question?: string;
        summary?: string;
        version?: number;
      };
      if (response.ok && payload.action === "applied" && payload.model) {
        onApplied(payload.model, payload.version ?? 0);
        setHistory((h) => [
          ...h,
          { kind: "applied", prompt, reply: payload.summary ?? "" },
        ]);
      } else if (response.ok && payload.action === "clarify") {
        setHistory((h) => [
          ...h,
          { kind: "question", prompt, reply: payload.question ?? "" },
        ]);
      } else {
        setHistory((h) => [
          ...h,
          {
            kind: "error",
            prompt,
            reply: payload.error ?? mapContent.edit.prompt.failed,
          },
        ]);
      }
    } catch {
      setHistory((h) => [
        ...h,
        { kind: "error", prompt, reply: mapContent.edit.prompt.failed },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <h2 className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {mapContent.edit.prompt.title}
      </h2>
      <ul
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3"
        ref={scrollRef}
      >
        {history.map((entry, index) => (
          <li className="text-xs" key={index}>
            <p className="font-mono text-muted-foreground">› {entry.prompt}</p>
            <p
              className={cn(
                "mt-1",
                entry.kind === "error" ? "text-destructive" : "text-foreground"
              )}
            >
              {entry.reply}
            </p>
          </li>
        ))}
        {busy && (
          <li className="animate-pulse text-xs text-muted-foreground">
            {mapContent.edit.prompt.busy}
          </li>
        )}
      </ul>
      <div className="flex gap-2 border-t p-2">
        <Input
          className="h-8 rounded-sm text-sm"
          disabled={busy}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void submit();
            }
          }}
          placeholder={mapContent.edit.prompt.placeholder}
          value={input}
        />
        <Button
          className="h-8 cursor-pointer rounded-sm px-3 text-xs"
          disabled={busy || input.trim() === ""}
          onClick={() => void submit()}
          size="sm"
          type="button"
        >
          {mapContent.edit.prompt.send}
        </Button>
      </div>
    </div>
  );
}
