"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCcw, ScrollText } from "lucide-react";
import { ErrorLogFeed } from "@/components/error-log-feed";
import { WorkspaceDebugFeed } from "@/components/workspace-debug-feed";
import { WorkspaceStyleFrame } from "@/components/workspace-style-frame";
import type { ErrorLogEntry } from "@/lib/error-log";
import {
  readWorkspaceDebugTrail,
  recordWorkspaceDebugEvent,
  type WorkspaceDebugEvent,
} from "@/lib/workspace-debug";

type ErrorLogsResponse = {
  entries: ErrorLogEntry[];
  logFilePath: string;
};

type CreateErrorLogResponse = {
  canViewLogs: boolean;
};

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const hasLoggedRef = useRef(false);
  const [canViewLogs, setCanViewLogs] = useState<boolean | null>(null);
  const [logFilePath, setLogFilePath] = useState<string | null>(null);
  const [recentLogs, setRecentLogs] = useState<ErrorLogEntry[]>([]);
  const [logLoadError, setLogLoadError] = useState<string | null>(null);
  const [debugTrail, setDebugTrail] = useState<WorkspaceDebugEvent[]>([]);

  useEffect(() => {
    if (hasLoggedRef.current) {
      return;
    }

    hasLoggedRef.current = true;
    let cancelled = false;

    async function captureError() {
      recordWorkspaceDebugEvent({
        level: "error",
        category: "runtime",
        message: error.message || "Unknown workspace error",
        detail: error.stack ?? pathname,
      });
      const currentTrail = readWorkspaceDebugTrail().slice(-40);
      setDebugTrail(currentTrail);

      try {
        const response = await fetch("/api/error-logs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: error.message,
            digest: error.digest ?? null,
            stack: error.stack ?? null,
            pathname,
            source: "workspace-error-boundary",
            debugTrail: currentTrail,
          }),
        });

        if (!response.ok) {
          throw new Error("Could not capture the workspace error");
        }

        const payload = (await response.json()) as CreateErrorLogResponse;
        if (cancelled) {
          return;
        }

        setCanViewLogs(payload.canViewLogs);

        if (!payload.canViewLogs) {
          return;
        }

        try {
          const logsResponse = await fetch("/api/error-logs?limit=10", {
            cache: "no-store",
          });

          if (!logsResponse.ok) {
            throw new Error("Could not load recent error logs");
          }

          const logsPayload = (await logsResponse.json()) as ErrorLogsResponse;
          if (cancelled) {
            return;
          }

          setRecentLogs(logsPayload.entries);
          setLogFilePath(logsPayload.logFilePath);
        } catch (loadError) {
          if (cancelled) {
            return;
          }

          setLogLoadError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load workspace logs",
          );
        }
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        setCanViewLogs(false);
        setLogLoadError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load workspace logs",
        );
      }
    }

    void captureError();

    return () => {
      cancelled = true;
    };
  }, [error.digest, error.message, error.stack, pathname]);

  const isAdmin = canViewLogs === true;
  const handleReset = () => {
    recordWorkspaceDebugEvent({
      category: "action",
      message: "Error page: try again",
      detail: pathname,
    });
    reset();
  };

  return (
    <WorkspaceStyleFrame>
      <div className="paper-shell">
        <div className="mx-auto grid max-w-6xl gap-6">
          <section className="paper-panel paper-panel-strong grid gap-6 p-6 md:p-8">
            <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
                <AlertTriangle className="h-6 w-6" />
              </div>

              <div className="grid gap-4">
                <div className="grid gap-3">
                  <span className="paper-badge">Workspace debug stage</span>
                  <h1 className="font-serif text-4xl leading-none md:text-5xl">
                    The authoring desk hit an unexpected failure.
                  </h1>
                  <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
                    This page keeps the last recorded actions, requests, and runtime errors from this tab so you can see what happened before the crash.
                  </p>
                </div>

                <div className="grid gap-3 rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
                  <div>
                    <p className="paper-label">Message</p>
                    <p className="text-sm leading-7 text-[var(--paper-ink)]">
                      {error.message || "Unknown workspace error"}
                    </p>
                  </div>
                  <div>
                    <p className="paper-label">Path</p>
                    <code className="block break-all text-sm text-[var(--paper-ink)]">
                      {pathname}
                    </code>
                  </div>
                  {error.digest ? (
                    <div>
                      <p className="paper-label">Digest</p>
                      <code className="block break-all text-sm text-[var(--paper-ink)]">
                        {error.digest}
                      </code>
                    </div>
                  ) : null}
                  {logFilePath ? (
                    <div>
                      <p className="paper-label">Log file</p>
                      <code className="block break-all text-sm text-[var(--paper-ink)]">
                        {logFilePath}
                      </code>
                    </div>
                  ) : null}
                </div>

                {isAdmin ? (
                  <div className="grid gap-3 rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
                    <p className="text-sm leading-7 text-[var(--paper-muted)]">
                      This incident was recorded on disk. The newest persisted entries are shown below for comparison.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="paper-button flex items-center gap-2"
                    onClick={handleReset}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Try again
                  </button>
                  <a
                    href="/app"
                    className="paper-button paper-button-secondary"
                    onClick={() =>
                      recordWorkspaceDebugEvent({
                        category: "action",
                        message: "Error page: back to dashboard",
                        detail: pathname,
                      })
                    }
                  >
                    Back to dashboard
                  </a>
                  {isAdmin ? (
                    <a
                      href="/app/settings/errors"
                      className="paper-button paper-button-secondary inline-flex items-center gap-2"
                      onClick={() =>
                        recordWorkspaceDebugEvent({
                          category: "action",
                          message: "Error page: open full logs",
                          detail: pathname,
                        })
                      }
                    >
                      <ScrollText className="h-4 w-4" />
                      Open full logs
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4">
            <div className="grid gap-2">
              <p className="paper-label">Session timeline</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                Ordered from oldest to newest so the final entries show the lead-up to this failure.
              </p>
            </div>
            <WorkspaceDebugFeed
              entries={debugTrail}
              emptyLabel="No actions were recorded before this workspace error."
            />
          </section>

          {isAdmin ? (
            <section className="grid gap-4">
              <div className="grid gap-2">
                <p className="paper-label">Recent log entries</p>
                <p className="text-sm leading-7 text-[var(--paper-muted)]">
                  Newest entries are shown first so you can compare this failure against recent workspace crashes.
                </p>
              </div>

              {logLoadError ? (
                <div className="paper-panel paper-panel-strong rounded-[var(--workspace-radius-panel)] p-6">
                  <p className="text-sm leading-7 text-[var(--paper-danger)]">
                    {logLoadError}
                  </p>
                </div>
              ) : (
                <ErrorLogFeed
                  entries={recentLogs}
                  emptyLabel="The current failure was recorded, but there are no other log entries yet."
                />
              )}
            </section>
          ) : null}
        </div>
      </div>
    </WorkspaceStyleFrame>
  );
}
