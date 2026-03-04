import type { ErrorLogEntry } from "@/lib/error-log";

type ErrorLogFeedProps = {
  entries: ErrorLogEntry[];
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

export function ErrorLogFeed({
  entries,
  emptyLabel = "No workspace errors have been logged yet.",
}: ErrorLogFeedProps) {
  if (!entries.length) {
    return (
      <section className="paper-panel paper-panel-strong rounded-[var(--workspace-radius-panel)] p-6">
        <p className="text-sm leading-7 text-[var(--paper-muted)]">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      {entries.map((entry) => (
        <article
          key={entry.id}
          className="paper-panel paper-panel-strong rounded-[var(--workspace-radius-panel)] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="paper-badge">{entry.role}</span>
              <span className="rounded-full border border-[var(--paper-border)] px-3 py-1 text-sm font-semibold text-[var(--paper-ink)]">
                {entry.username}
              </span>
              <span className="rounded-full border border-[var(--paper-border)] px-3 py-1 text-xs uppercase tracking-[0.12em] text-[var(--paper-muted)]">
                {entry.source}
              </span>
            </div>
            <p className="text-sm text-[var(--paper-muted)]">
              {formatTimestamp(entry.createdAt)}
            </p>
          </div>

          <p className="mt-4 text-lg font-semibold text-[var(--paper-ink)]">
            {entry.message}
          </p>

          <div className="mt-4 grid gap-3 text-sm text-[var(--paper-muted)]">
            {entry.pathname ? (
              <div>
                <p className="paper-label">Path</p>
                <code className="block break-all rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-3 py-2 text-[var(--paper-ink)]">
                  {entry.pathname}
                </code>
              </div>
            ) : null}

            {entry.digest ? (
              <div>
                <p className="paper-label">Digest</p>
                <code className="block break-all rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-3 py-2 text-[var(--paper-ink)]">
                  {entry.digest}
                </code>
              </div>
            ) : null}

            {entry.stack ? (
              <div>
                <p className="paper-label">Stack</p>
                <pre className="max-h-[24rem] overflow-auto rounded-[18px] border border-[var(--paper-border)] bg-[rgba(26,23,20,0.96)] p-4 text-xs leading-6 whitespace-pre-wrap break-words text-[var(--paper-code-text)]">
                  {entry.stack}
                </pre>
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
