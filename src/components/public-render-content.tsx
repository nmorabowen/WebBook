"use client";

import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { bookTypographyStyle, type BookTypography } from "@/lib/book-typography";
import type { GeneralSettings, ManifestEntry } from "@/lib/content/schemas";
import type { FontPreset } from "@/lib/font-presets";

type PreviewChapterItem = {
  slug: string;
  title: string;
  order: number;
  summary?: string;
};

type PublicRenderContentProps = {
  mode: "book" | "note" | "chapter";
  title: string;
  summary?: string;
  markdown: string;
  manifest: ManifestEntry[];
  pageId: string;
  requester: "admin" | "public";
  allowExecution?: boolean;
  fontPreset?: FontPreset;
  typography?: Partial<BookTypography>;
  bookTitle?: string;
  chapterOrder?: number;
  bookSlug?: string;
  chapters?: PreviewChapterItem[];
  sourceNavigation?: boolean;
  generalSettings?: GeneralSettings;
};

export function PublicRenderContent({
  mode,
  title,
  summary,
  markdown,
  manifest,
  pageId,
  requester,
  allowExecution = false,
  fontPreset = "source-serif",
  typography,
  bookTitle,
  chapterOrder,
  bookSlug,
  chapters = [],
  sourceNavigation = false,
  generalSettings,
}: PublicRenderContentProps) {
  const cardRadius = `${Math.max((generalSettings?.cornerRadius ?? 28) - 6, 0)}px`;
  const tileSpacing = `${generalSettings?.tileSpacing ?? 1.5}rem`;
  const layoutStyle = {
    ...bookTypographyStyle(typography),
    gap: tileSpacing,
  };

  if (mode === "chapter") {
    return (
      <div className="reading-column grid" style={layoutStyle}>
        <div className="reading-width-frame grid gap-3">
          <span className="paper-badge">
            Chapter {chapterOrder ?? 1} of {bookTitle ?? "Untitled book"}
          </span>
          <h1 className="chapter-hero-title">{title}</h1>
          {summary ? <p className="chapter-hero-summary">{summary}</p> : null}
        </div>

        <div className="reading-width-frame">
          <MarkdownRenderer
            markdown={markdown}
            manifest={manifest}
            pageId={pageId}
            requester={requester}
            allowExecution={allowExecution}
            fontPreset={fontPreset}
            typography={typography}
            sourceNavigation={sourceNavigation}
          />
        </div>
      </div>
    );
  }

  if (mode === "book") {
    return (
      <div className="reading-column grid" style={layoutStyle}>
        <div className="reading-width-frame grid gap-3">
          <span className="paper-badge">{chapters.length} chapters</span>
          <h1 className="book-hero-title">{title}</h1>
          {summary ? <p className="book-hero-summary">{summary}</p> : null}
        </div>

        <div className="reading-width-frame">
          <MarkdownRenderer
            markdown={markdown}
            manifest={manifest}
            pageId={pageId}
            requester={requester}
            allowExecution={false}
            fontPreset={fontPreset}
            typography={typography}
            sourceNavigation={sourceNavigation}
          />
        </div>

        {chapters.length ? (
          <section
            className="reading-width-frame grid"
            style={{ gap: `calc(${tileSpacing} * 0.5)` }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="book-section-title">Published chapters</h2>
              <span className="paper-badge">{chapters.length}</span>
            </div>
            <div className="grid" style={{ gap: `calc(${tileSpacing} * 0.35)` }}>
              {chapters.map((chapter) => (
                <a
                  key={chapter.slug}
                  href={bookSlug ? `/books/${bookSlug}/${chapter.slug}` : "#"}
                  className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] px-5 py-4 transition hover:-translate-y-0.5"
                  style={{ borderRadius: cardRadius }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="book-chapter-card-title">
                      Chapter {chapter.order}: {chapter.title}
                    </h3>
                    <span className="paper-badge">Open</span>
                  </div>
                  {chapter.summary ? (
                    <p className="book-chapter-card-summary mt-2">
                      {chapter.summary}
                    </p>
                  ) : null}
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="reading-column grid" style={layoutStyle}>
      <div className="reading-width-frame grid gap-3">
        <span className="paper-badge">Standalone note</span>
        <h1 className="font-serif text-6xl leading-[0.95] tracking-[-0.04em]">{title}</h1>
        {summary ? <p className="text-lg leading-8 text-[var(--paper-muted)]">{summary}</p> : null}
      </div>

      <div className="reading-width-frame">
        <MarkdownRenderer
          markdown={markdown}
          manifest={manifest}
          pageId={pageId}
          requester={requester}
          allowExecution={allowExecution}
          fontPreset={fontPreset}
          typography={typography}
          sourceNavigation={sourceNavigation}
        />
      </div>
    </div>
  );
}
