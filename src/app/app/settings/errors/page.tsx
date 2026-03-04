import { AlertTriangle, FileWarning, FolderSearch } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ErrorLogFeed } from "@/components/error-log-feed";
import { requireAdminSession } from "@/lib/auth";
import { getContentTree, getGeneralSettings } from "@/lib/content/service";
import { getErrorLogFilePath, listErrorLogs } from "@/lib/error-log";

export const dynamic = "force-dynamic";

export default async function ErrorLogsPage() {
  const session = await requireAdminSession();
  const [tree, generalSettings, logs] = await Promise.all([
    getContentTree(),
    getGeneralSettings(),
    listErrorLogs(50),
  ]);

  return (
    <AppShell
      tree={tree}
      currentPath="/app/settings/errors"
      generalSettings={generalSettings}
      session={session}
      rightPanel={
        <div className="grid gap-6">
          <div className="grid gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="paper-label">Admin diagnostics</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                Workspace crashes captured by the `/app` error boundary are written to disk here for admin review.
              </p>
            </div>
          </div>

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
              <FolderSearch className="h-4 w-4" />
              Log file
            </div>
            <code className="mt-3 block break-all text-sm leading-7 text-[var(--paper-ink)]">
              {getErrorLogFilePath()}
            </code>
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-3">
          <span className="paper-badge">Admin monitoring</span>
          <h1 className="font-serif text-5xl leading-none">Error logs</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
            Review recent workspace failures without leaving the authoring desk. Entries are ordered newest first.
          </p>
        </div>

        <ErrorLogFeed entries={logs} />
      </div>
    </AppShell>
  );
}
