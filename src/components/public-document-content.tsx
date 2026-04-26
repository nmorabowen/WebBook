import type { HTMLAttributeAnchorTarget, ReactNode } from "react";
import { PublicMarkdownRenderer } from "@/components/markdown/public-markdown-renderer";
import { bookTypographyStyle, type BookTypography } from "@/lib/book-typography";
import { nestedChapterNumber } from "@/lib/chapter-numbering";
import type { GeneralSettings, ManifestEntry } from "@/lib/content/schemas";
import type { FontPreset } from "@/lib/font-presets";
import { DEFAULT_GENERAL_SETTINGS } from "@/lib/general-settings-config";

export type PublicDocumentChapterItem = {
  path: string[];
  title: string;
  summary?: string;
  children: PublicDocumentChapterItem[];
};

type PublicDocumentContentProps = {
  mode: "book" | "note" | "chapter";
  title: string;
  summary?: string;
  markdown: string;
  manifest: ManifestEntry[];
  pageId: string;
  requester: "admin" | "public";
  fontPreset?: FontPreset;
  typography?: Partial<BookTypography>;
  bookTitle?: string;
  chapterNumber?: string;
  bookSlug?: string;
  chapters?: PublicDocumentChapterItem[];
  generalSettings?: GeneralSettings;
  currentRoute?: string;
  linkTarget?: HTMLAttributeAnchorTarget;
  linkRel?: string;
};

export function PublicDocumentContent({
  mode,
  title,
  summary,
  markdown,
  manifest,
  pageId,
  requester: _requester,
  fontPreset = "source-serif",
  typography,
  bookTitle,
  chapterNumber,
  bookSlug,
  chapters = [],
  generalSettings,
  currentRoute,
  linkTarget,
  linkRel,
}: PublicDocumentContentProps) {
  const countChapters = (items: PublicDocumentChapterItem[]): number =>
    items.reduce((total, item) => total + 1 + countChapters(item.children), 0);

  const totalChapterCount = countChapters(chapters);
  const cardRadius = `${Math.max(
    (generalSettings?.cornerRadius ?? DEFAULT_GENERAL_SETTINGS.cornerRadius) - 6,
    0,
  )}px`;
  const tileSpacing = `${
    generalSettings?.tileSpacing ?? DEFAULT_GENERAL_SETTINGS.tileSpacing
  }rem`;
  const layoutStyle = {
    ...bookTypographyStyle(typography),
    gap: tileSpacing,
  };

  if (mode === "chapter") {
    return (
      <div
        className="reading-column grid"
        style={layoutStyle}
        data-font-preset={fontPreset}
      >
        <div className="reading-width-frame grid gap-3">
          <span className="paper-badge">
            Chapter {chapterNumber ?? "1"} of {bookTitle ?? "Untitled book"}
          </span>
          <h1 className="chapter-hero-title">{title}</h1>
          {summary ? <p className="chapter-hero-summary">{summary}</p> : null}
        </div>

        <div className="reading-width-frame">
          <PublicMarkdownRenderer
            markdown={markdown}
            manifest={manifest}
            pageId={pageId}
            fontPreset={fontPreset}
            typography={typography}
            currentRoute={currentRoute}
            linkTarget={linkTarget}
            linkRel={linkRel}
          />
        </div>
      </div>
    );
  }

  if (mode === "book") {
    return (
      <div
        className="reading-column grid"
        style={layoutStyle}
        data-font-preset={fontPreset}
      >
        <div className="reading-width-frame grid gap-3">
          <span className="paper-badge">{totalChapterCount} chapters</span>
          <h1 className="book-hero-title">{title}</h1>
          {summary ? <p className="book-hero-summary">{summary}</p> : null}
        </div>

        <div className="reading-width-frame">
          <PublicMarkdownRenderer
            markdown={markdown}
            manifest={manifest}
            pageId={pageId}
            fontPreset={fontPreset}
            typography={typography}
            currentRoute={currentRoute}
            linkTarget={linkTarget}
            linkRel={linkRel}
          />
        </div>

        {totalChapterCount ? (
          <section
            className="reading-width-frame grid"
            style={{ gap: `calc(${tileSpacing} * 0.5)` }}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="book-section-title">Published chapters</h2>
              <span className="paper-badge">{totalChapterCount}</span>
            </div>
            <div className="grid" style={{ gap: `calc(${tileSpacing} * 0.35)` }}>
              {(() => {
                const renderChapterCards = (
                  items: PublicDocumentChapterItem[],
                  depth = 0,
                  parentNumber = "",
                ): ReactNode =>
                  items.map((chapter, chapterIndex) => {
                    const chapterNumberValue = nestedChapterNumber(parentNumber, chapterIndex);
                    return (
                      <div key={chapter.path.join("/")} className="grid gap-2">
                        <a
                          href={bookSlug ? `/books/${bookSlug}/${chapter.path.join("/")}` : "#"}
                          className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] px-5 py-4 transition hover:-translate-y-0.5"
                          target={linkTarget}
                          rel={linkRel}
                          style={{
                            borderRadius: cardRadius,
                            marginLeft: `${depth * 14}px`,
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="book-chapter-card-title">
                              Chapter {chapterNumberValue}: {chapter.title}
                            </h3>
                            <span className="paper-badge">Open</span>
                          </div>
                          {chapter.summary ? (
                            <p className="book-chapter-card-summary mt-2">
                              {chapter.summary}
                            </p>
                          ) : null}
                        </a>
                        {chapter.children.length
                          ? renderChapterCards(chapter.children, depth + 1, chapterNumberValue)
                          : null}
                      </div>
                    );
                  });

                return renderChapterCards(chapters);
              })()}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="reading-column grid"
      style={layoutStyle}
      data-font-preset={fontPreset}
    >
      <div className="reading-width-frame grid gap-3">
        <span className="paper-badge">Standalone note</span>
        <h1 className="book-hero-title">{title}</h1>
        {summary ? <p className="book-hero-summary">{summary}</p> : null}
      </div>

      <div className="reading-width-frame">
        <PublicMarkdownRenderer
          markdown={markdown}
          manifest={manifest}
          pageId={pageId}
          fontPreset={fontPreset}
          typography={typography}
          currentRoute={currentRoute}
          linkTarget={linkTarget}
          linkRel={linkRel}
        />
      </div>
    </div>
  );
}
