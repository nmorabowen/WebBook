import Link from "next/link";
import type { ManifestEntry } from "@/lib/content/schemas";
import type { TocItem } from "@/lib/markdown/shared";
import { formatRelativeDate } from "@/lib/utils";

type TocPanelProps = {
  toc: TocItem[];
  backlinks: ManifestEntry[];
  updatedAt?: string;
  revisions?: string[];
};

export function TocPanel({
  toc,
  backlinks,
  updatedAt,
  revisions = [],
}: TocPanelProps) {
  return (
    <div className="grid gap-8">
      <section>
        <p className="paper-label">Outline</p>
        <div className="toc-list">
          {toc.length ? (
            toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="paper-nav-link"
                style={{ paddingLeft: `${Math.max(item.depth - 1, 0) * 14 + 14}px` }}
              >
                {item.value}
              </a>
            ))
          ) : (
            <p className="text-sm text-[var(--paper-muted)]">No headings yet.</p>
          )}
        </div>
      </section>

      <section>
        <p className="paper-label">Backlinks</p>
        <div className="backlink-list">
          {backlinks.length ? (
            backlinks.map((entry) => (
              <Link key={entry.id} href={entry.route} className="paper-nav-link">
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
