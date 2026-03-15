import Link from "next/link";
import type { ActivityLogEntry } from "@/lib/activity-log";

type ActivityLogFeedProps = {
  entries: ActivityLogEntry[];
  emptyLabel?: string;
};

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.valueOf())) {
    return timestamp;
  }

  return timestampFormatter.format(parsed);
}

export function ActivityLogFeed({
  entries,
  emptyLabel = "No workspace activity has been logged yet.",
}: ActivityLogFeedProps) {
  if (!entries.length) {
    return (
      <section className="paper-panel paper-panel-strong rounded-[var(--workspace-radius-panel)] p-6">
        <p className="text-sm leading-7 text-[var(--paper-muted)]">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {entries.map((entry) => {
        const content = entry.content;
        const primaryTimestamp = entry.count > 1 ? entry.updatedAt : entry.createdAt;

        return (
          <article
            key={entry.id}
            className="paper-panel paper-panel-strong rounded-[var(--workspace-radius-panel)] p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="paper-badge">{entry.actor.role}</span>
                <span className="rounded-full border border-[var(--paper-border)] px-3 py-1 text-sm font-semibold text-[var(--paper-ink)]">
                  {entry.actor.username}
                </span>
                <span className="rounded-full border border-[var(--paper-border)] px-3 py-1 text-xs uppercase tracking-[0.12em] text-[var(--paper-muted)]">
                  {entry.eventType === "login" ? "login" : "edit"}
                </span>
                {entry.count > 1 ? (
                  <span className="rounded-full border border-[var(--paper-border)] px-3 py-1 text-xs font-semibold text-[var(--paper-ink)]">
                    {entry.count} saves
                  </span>
                ) : null}
              </div>

              <div className="text-right text-sm text-[var(--paper-muted)]">
                <p>{formatTimestamp(primaryTimestamp)}</p>
                {entry.count > 1 ? (
                  <p className="mt-1 text-xs uppercase tracking-[0.08em]">
                    First seen {formatTimestamp(entry.createdAt)}
                  </p>
                ) : null}
              </div>
            </div>

            <p className="mt-4 text-lg font-semibold text-[var(--paper-ink)]">{entry.message}</p>

            {content ? (
              <div className="mt-4 grid gap-3 text-sm text-[var(--paper-muted)]">
                <div>
                  <p className="paper-label">Content</p>
                  <div className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="paper-badge">{content.kind}</span>
                      <span className="font-semibold text-[var(--paper-ink)]">{content.title}</span>
                    </div>
                    <p className="mt-2 break-all text-xs uppercase tracking-[0.12em]">
                      {content.workspaceRoute}
                    </p>
                    <div className="mt-3">
                      <Link
                        href={content.workspaceRoute}
                        className="paper-button paper-button-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        Open in editor
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
