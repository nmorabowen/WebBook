"use client";

import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { bookTypographyStyle, type BookTypography } from "@/lib/book-typography";
import type { ManifestEntry } from "@/lib/content/schemas";
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
}: PublicRenderContentProps) {
  if (mode === "chapter") {
    return (
      <div className="grid gap-8" style={bookTypographyStyle(typography)}>
        <div className="grid gap-3">
          <span className="paper-badge">
            Chapter {chapterOrder ?? 1} of {bookTitle ?? "Untitled book"}
          </span>
          <h1 className="chapter-hero-title">{title}</h1>
          {summary ? <p className="chapter-hero-summary">{summary}</p> : null}
        </div>

        <MarkdownRenderer
          markdown={markdown}
          manifest={manifest}
          pageId={pageId}
          requester={requester}
          allowExecution={allowExecution}
          fontPreset={fontPreset}
          typography={typography}
        />
      </div>
    );
  }

  if (mode === "book") {
    return (
      <div className="grid gap-8">
        <div className="grid gap-3">
          <span className="paper-badge">{chapters.length} chapters</span>
          <h1 className="font-serif text-6xl leading-[0.95] tracking-[-0.04em]">{title}</h1>
          {summary ? (
            <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">{summary}</p>
          ) : null}
        </div>

        <MarkdownRenderer
          markdown={markdown}
          manifest={manifest}
          pageId={pageId}
          requester={requester}
          allowExecution={false}
          fontPreset={fontPreset}
          typography={typography}
        />

        {chapters.length ? (
          <section className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-3xl">Published chapters</h2>
              <span className="paper-badge">{chapters.length}</span>
            </div>
            <div className="grid gap-3">
              {chapters.map((chapter) => (
                <a
                  key={chapter.slug}
                  href={bookSlug ? `/books/${bookSlug}/${chapter.slug}` : "#"}
                  className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] px-5 py-4 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold">
                      Chapter {chapter.order}: {chapter.title}
                    </h3>
                    <span className="paper-badge">Open</span>
                  </div>
                  {chapter.summary ? (
                    <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
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
    <div className="grid gap-8">
      <div className="grid gap-3">
        <span className="paper-badge">Standalone note</span>
        <h1 className="font-serif text-6xl leading-[0.95] tracking-[-0.04em]">{title}</h1>
        {summary ? (
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">{summary}</p>
        ) : null}
      </div>

      <MarkdownRenderer
        markdown={markdown}
        manifest={manifest}
        pageId={pageId}
        requester={requester}
        allowExecution={allowExecution}
        fontPreset={fontPreset}
      />
    </div>
  );
}
