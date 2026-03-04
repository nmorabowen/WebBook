import Link from "next/link";
import { AlertTriangle, Bug, FileWarning, FolderSearch, Home, Route } from "lucide-react";
import { ErrorLogFeed } from "@/components/error-log-feed";
import { WorkspaceStyleFrame } from "@/components/workspace-style-frame";
import { requireAdminSession } from "@/lib/auth";
import { getErrorLogFilePath, listErrorLogs } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export default async function ErrorLogsPage() {
  const session = await requireAdminSession();
  const logs = await listErrorLogs(50);
  const logsWithDebugTrail = logs.filter((entry) => entry.debugTrail.length > 0).length;

  return (
    <WorkspaceStyleFrame>
      <div className="paper-shell">
        <div className="mx-auto grid max-w-6xl gap-6">
          <section className="paper-panel paper-panel-strong grid gap-6 p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="grid gap-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
                  <Bug className="h-5 w-5" />
                </div>
                <div className="grid gap-3">
                  <span className="paper-badge">Workspace debug console</span>
                  <h1 className="font-serif text-5xl leading-none">Crash timeline logs</h1>
                  <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
                    This page loads independently from the authoring desk so admins can still inspect failures when the main workspace is unstable. Newer incidents include the recorded session timeline that led into the crash.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/app"
                  className="paper-button paper-button-secondary inline-flex items-center gap-2"
                >
                  <Home className="h-4 w-4" />
                  Dashboard
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
                  <FileWarning className="h-4 w-4" />
                  Captured entries
                </div>
                <p className="mt-2 text-3xl font-semibold text-[var(--paper-ink)]">
                  {logs.length}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                  Showing the newest {logs.length} entries from the workspace error log.
                </p>
              </div>

              <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
                  <Route className="h-4 w-4" />
                  Debug trails
                </div>
                <p className="mt-2 text-3xl font-semibold text-[var(--paper-ink)]">
                  {logsWithDebugTrail}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                  Entries that already include a recorded session timeline from the crashing browser tab.
                </p>
              </div>

              <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
                  <AlertTriangle className="h-4 w-4" />
                  Access
                </div>
                <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                  Signed in as <span className="font-semibold text-[var(--paper-ink)]">{session.username}</span>. Only admins can open this page.
                </p>
              </div>
            </div>

            <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
                <FolderSearch className="h-4 w-4" />
                Log file
              </div>
              <code className="mt-3 block break-all text-sm leading-7 text-[var(--paper-ink)]">
                {getErrorLogFilePath()}
              </code>
            </div>
          </section>

          <ErrorLogFeed entries={logs} />
        </div>
      </div>
    </WorkspaceStyleFrame>
  );
}
