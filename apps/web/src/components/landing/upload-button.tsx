"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { landingContent } from "@/data/landing";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type UploadState =
  | { kind: "error"; message: string }
  | { kind: "idle" }
  | { kind: "uploading" };

export function UploadButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  async function handleFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({ kind: "error", message: landingContent.hero.upload.tooLarge });
      return;
    }
    setState({ kind: "uploading" });
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${API_URL}/projects`, {
        body,
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }
      const { id } = (await response.json()) as { id: string };
      // Kick off parsing right away; the map page polls for the outcome.
      await fetch(`${API_URL}/projects/${id}/parse`, { method: "POST" });
      router.push(`/map/${id}`);
    } catch {
      setState({ kind: "error", message: landingContent.hero.upload.failed });
    }
  }

  const uploading = state.kind === "uploading";

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        accept={ACCEPTED_TYPES}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void handleFile(file);
          }
        }}
        type="file"
      />
      <Button
        className="h-11 cursor-pointer rounded-md px-6 text-base"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {uploading
          ? landingContent.hero.upload.uploading
          : landingContent.hero.upload.label}
      </Button>
      <p
        aria-live="polite"
        className={cn(
          "text-sm",
          state.kind === "error" ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {state.kind === "error"
          ? state.message
          : landingContent.hero.upload.hint}
      </p>
    </div>
  );
}
