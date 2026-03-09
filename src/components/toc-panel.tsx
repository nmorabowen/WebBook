"use client";

import type { TocItem } from "@/lib/markdown/shared";

type TocPanelProps = {
  toc: TocItem[];
  onNavigate?: (id: string) => void;
};

export function TocPanel({ toc, onNavigate }: TocPanelProps) {
  return (
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
              onClick={(event) => {
                if (!onNavigate) {
                  return;
                }

                event.preventDefault();
                onNavigate(item.id);
              }}
            >
              {item.value}
            </a>
          ))
        ) : (
          <p className="text-sm text-[var(--paper-muted)]">No headings yet.</p>
        )}
      </div>
    </section>
  );
}
