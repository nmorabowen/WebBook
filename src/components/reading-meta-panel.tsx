import Link from "next/link";
import type { ManifestEntry } from "@/lib/content/schemas";
import { formatRelativeDate } from "@/lib/utils";

type ReadingMetaPanelProps = {
  backlinks: ManifestEntry[];
  updatedAt?: string;
  revisions?: string[];
  linkTarget?: string;
  linkRel?: string;
};

export function ReadingMetaPanel({
  backlinks,
  updatedAt,
  revisions = [],
  linkTarget,
  linkRel,
}: ReadingMetaPanelProps) {
  const validBacklinks = backlinks.filter(
    (entry) => typeof entry.route === "string" && entry.route.trim().length > 0,
  );

  return (
    <div className="grid gap-8">
      <section>
        <p className="paper-label">Backlinks</p>
        <div className="backlink-list">
          {validBacklinks.length ? (
            validBacklinks.map((entry) => (
              <Link
                key={entry.id}
                href={entry.route}
                className="paper-nav-link"
                target={linkTarget}
                rel={linkRel}
              >
                {entry.title}
              </Link>
            ))
          ) : (
            <p className="text-sm text-[var(--paper-muted)]">No backlinks yet.</p>
          )}
        </div>
      </section>

      <section>
        <p className="paper-label">Freshness</p>
        <p className="text-sm text-[var(--paper-muted)]">
          Updated {formatRelativeDate(updatedAt)}
        </p>
      </section>

      {revisions.length ? (
        <section>
          <p className="paper-label">Recent snapshots</p>
          <div className="grid gap-2">
            {revisions.slice(0, 5).map((revision) => (
              <div
                key={revision}
                className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-3 py-2 text-xs text-[var(--paper-muted)]"
              >
                {revision}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
