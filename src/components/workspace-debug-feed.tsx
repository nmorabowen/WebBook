import type { WorkspaceDebugEvent } from "@/lib/workspace-debug";

type WorkspaceDebugFeedProps = {
  entries: WorkspaceDebugEvent[];
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

export function WorkspaceDebugFeed({
  entries,
  emptyLabel = "No debug activity was recorded for this session.",
}: WorkspaceDebugFeedProps) {
  if (!entries.length) {
    return (
      <div className="rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
        <p className="text-sm leading-7 text-[var(--paper-muted)]">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {entries.map((entry) => (
        <article
          key={entry.id}
          className="rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="paper-badge">{entry.category}</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                  entry.level === "error"
                    ? "bg-[rgba(197,93,53,0.12)] text-[var(--paper-danger)]"
                    : "bg-[rgba(73,57,38,0.08)] text-[var(--paper-muted)]"
                }`}
              >
                {entry.level}
              </span>
            </div>
            <p className="text-sm text-[var(--paper-muted)]">
              {formatTimestamp(entry.createdAt)}
            </p>
          </div>

          <p className="mt-3 text-base font-semibold text-[var(--paper-ink)]">
            {entry.message}
          </p>

          {entry.detail ? (
            <pre className="mt-3 overflow-auto rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.82)] px-3 py-2 text-xs leading-6 whitespace-pre-wrap break-words text-[var(--paper-muted)]">
              {entry.detail}
            </pre>
          ) : null}
        </article>
      ))}
    </div>
  );
}
