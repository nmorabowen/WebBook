"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { LoaderCircle, Play, TriangleAlert } from "lucide-react";
import { CopyCodeButton } from "@/components/markdown/copy-code-button";
import { HighlightedCode } from "@/components/markdown/highlighted-code";
import { cn } from "@/lib/utils";

type ExecutionArtifact = {
  kind: "image/png";
  base64: string;
};

type ExecutionResponse = {
  ok: boolean;
  stdout: string;
  stderr: string;
  artifacts: ExecutionArtifact[];
  durationMs: number;
  cached: boolean;
};

type ExecutableCodeBlockProps = {
  code: string;
  language: string;
  pageId: string;
  cellId: string;
  executionEnabled: boolean;
  requester: "admin" | "public";
};

export function ExecutableCodeBlock({
  code,
  language,
  pageId,
  cellId,
  executionEnabled,
  requester,
}: ExecutableCodeBlockProps) {
  const [result, setResult] = useState<ExecutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/execute/python", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cellId,
            source: code,
            pageId,
            requester,
          }),
        });

        const payload = (await response.json()) as ExecutionResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Execution failed");
        }

        setResult(payload);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to execute Python.",
        );
      }
    });
  };

  return (
    <div className="my-5 overflow-hidden rounded-[26px] bg-[var(--paper-code)] text-[var(--paper-code-text)]">
      <div className="code-block-header">
        <div className="flex items-center gap-3">
          <span className="code-block-language">{language}</span>
          {result?.cached ? <span className="code-block-status">cached</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <CopyCodeButton code={code} />
          {executionEnabled && language === "python" ? (
            <button
              type="button"
              className="paper-button flex items-center gap-2 px-4 py-2 text-sm"
              onClick={run}
              disabled={isPending}
            >
              {isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run Python
            </button>
          ) : (
            <span className="code-block-status">
              Static block
            </span>
          )}
        </div>
      </div>
      <pre className={cn("m-0 rounded-none", !executionEnabled && "opacity-90")}>
        <HighlightedCode code={code} language={language} />
      </pre>
      {result ? (
        <div className="animate-rise grid gap-4 border-t border-[var(--paper-border)] px-4 py-4">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-[var(--paper-muted)]">
            <span>{result.durationMs}ms</span>
            <span>{result.ok ? "completed" : "failed"}</span>
          </div>
          {result.stdout ? (
            <div>
              <p className="paper-label">Stdout</p>
              <pre className="m-0 rounded-[18px] bg-[rgba(26,23,20,0.96)] p-4 text-[var(--paper-code-text)]">
                {result.stdout}
              </pre>
            </div>
          ) : null}
          {result.stderr ? (
            <div>
              <p className="paper-label text-[var(--paper-danger)]">Stderr</p>
              <pre className="m-0 rounded-[18px] bg-[rgba(145,47,47,0.12)] p-4 text-[var(--paper-danger)]">
                {result.stderr}
              </pre>
            </div>
          ) : null}
          {result.artifacts.length > 0 ? (
            <div className="grid gap-3">
              <p className="paper-label">Artifacts</p>
              {result.artifacts.map((artifact, index) => (
                <Image
                  key={`${artifact.kind}-${index}`}
                  src={`data:${artifact.kind};base64,${artifact.base64}`}
                  alt="Python execution artifact"
                  className="max-w-full rounded-[20px] border border-[var(--paper-border)]"
                  width={1200}
                  height={800}
                  unoptimized
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-2 border-t border-[var(--paper-border)] bg-[rgba(145,47,47,0.09)] px-4 py-3 text-sm text-[var(--paper-danger)]">
          <TriangleAlert className="h-4 w-4" />
          {error}
        </div>
      ) : null}
    </div>
  );
}
