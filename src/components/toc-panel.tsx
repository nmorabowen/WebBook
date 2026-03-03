import type { TocItem } from "@/lib/markdown/shared";

type TocPanelProps = {
  toc: TocItem[];
};

export function TocPanel({ toc }: TocPanelProps) {
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
