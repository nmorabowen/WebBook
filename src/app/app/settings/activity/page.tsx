import Link from "next/link";
import { FileClock, Home, LockKeyhole, NotebookPen } from "lucide-react";
import { ActivityLogFeed } from "@/components/activity-log-feed";
import { AppShell } from "@/components/app-shell";
import {
  getActivityLogFilePath,
  listVisibleActivityLogEntries,
} from "@/lib/activity-log";
import { requireSession } from "@/lib/auth";
import { getContentTree, getGeneralSettings } from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  filterContentTreeForScope,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export default async function ActivitySettingsPage() {
  const session = await requireSession();
  const [rawTree, generalSettings] = await Promise.all([
    getContentTree(),
    getGeneralSettings(),
  ]);
  const scope = await buildWorkspaceAccessScope(session, rawTree);
  const tree = filterContentTreeForScope(rawTree, scope);
  const entries = await listVisibleActivityLogEntries(scope, 50);
  const loginCount = entries.filter((entry) => entry.eventType === "login").length;
  const editCount = entries.filter((entry) => entry.eventType === "content-edit").length;

  return (
    <AppShell
      tree={tree}
      currentPath="/app/settings/activity"
      generalSettings={generalSettings}
      session={session}
      rightPanel={
        <div className="grid gap-6">
          <div className="grid gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
              <FileClock className="h-5 w-5" />
            </div>
            <div>
              <p className="paper-label">Workspace activity</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                Signed-in users can review recent login and edit activity. Editor access is filtered to their own login events and content they can open.
              </p>
            </div>
          </div>

          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <LockKeyhole className="h-4 w-4" />
              Access
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Signed in as <span className="font-semibold text-[var(--paper-ink)]">{session.username}</span>. Admins see the full stream. Editors see a scoped view.
            </p>
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-3">
            <span className="paper-badge">Workspace audit</span>
            <h1 className="font-serif text-5xl leading-none">Activity log</h1>
            <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
              Review recent sign-ins and content edits across the authoring workspace.
            </p>
          </div>

          <Link
            href="/app"
            className="paper-button paper-button-secondary inline-flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <FileClock className="h-4 w-4" />
              Visible entries
            </div>
            <p className="mt-2 text-3xl font-semibold text-[var(--paper-ink)]">{entries.length}</p>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Showing the newest visible entries from the workspace activity log.
            </p>
          </div>

          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <LockKeyhole className="h-4 w-4" />
              Logins
            </div>
            <p className="mt-2 text-3xl font-semibold text-[var(--paper-ink)]">{loginCount}</p>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Successful sign-ins captured in the visible stream.
            </p>
          </div>

          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <NotebookPen className="h-4 w-4" />
              Edits
            </div>
            <p className="mt-2 text-3xl font-semibold text-[var(--paper-ink)]">{editCount}</p>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Content save activity, with repeated autosaves coalesced into rolling entries.
            </p>
          </div>
        </div>

        <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
            <FileClock className="h-4 w-4" />
            Log file
          </div>
          <code className="mt-3 block break-all text-sm leading-7 text-[var(--paper-ink)]">
            {getActivityLogFilePath()}
          </code>
        </div>

        <ActivityLogFeed entries={entries} />
      </div>
    </AppShell>
  );
}
