import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { MathHydrator } from "@/components/markdown/math-hydrator";
import { PublicDocumentContent } from "@/components/public-document-content";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";
import { PublicStyleFrame } from "@/components/public-style-frame";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getPublicBacklinks,
  getGeneralSettings,
  getPublicManifest,
  getPublicContentTree,
  resolvePublicChapterRoute,
} from "@/lib/content/service";
import { getChapterNumberByPath } from "@/lib/chapter-numbering";
import { containsMathSyntax, extractToc } from "@/lib/markdown/shared";
import { buildPublicMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterPath: string[] }>;
}): Promise<Metadata> {
  const { bookSlug, chapterPath } = await params;
  const requestedPath = chapterPath ?? [];
  const result = await resolvePublicChapterRoute(bookSlug, requestedPath);

  if (!result) {
    return buildPublicMetadata({
      title: "Chapter Not Found | WebBook",
      description: "The requested chapter is not published.",
      path: `/books/${bookSlug}/${requestedPath.join("/")}`,
      noIndex: true,
    });
  }

  const { book, chapter } = result;

  return buildPublicMetadata({
    title: `${chapter.meta.title} | ${book.meta.title} | WebBook`,
    description:
      chapter.meta.summary ??
      `Read ${chapter.meta.title} from ${book.meta.title} on WebBook.`,
    path: `/books/${book.meta.slug}/${chapter.path.join("/")}`,
    type: "article",
    publishedTime: chapter.meta.publishedAt,
    modifiedTime: chapter.meta.updatedAt,
  });
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterPath: string[] }>;
}) {
  const { bookSlug, chapterPath } = await params;
  const requestedPath = chapterPath ?? [];
  const result = await resolvePublicChapterRoute(bookSlug, requestedPath);
  if (!result) {
    notFound();
  }
  if (result.aliased) {
    redirect(result.publicRoute);
  }

  const { book, chapter } = result;
  const [tree, manifest, backlinks, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getPublicManifest(),
    getPublicBacklinks(chapter.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(chapter.body);
  const hasMath = containsMathSyntax(chapter.body);
  const chapterRoute = `/books/${book.meta.slug}/${chapter.path.join("/")}`;
  const chapterNumber =
    getChapterNumberByPath(book.chapters, chapter.path) ?? String(chapter.meta.order);

  return (
    <PublicStyleFrame generalSettings={generalSettings}>
      {hasMath ? <MathHydrator /> : null}
      <PublicShell
        tree={tree}
        currentPath={chapterRoute}
        bookSlug={book.meta.slug}
        fontPreset={chapter.meta.fontPreset ?? book.meta.fontPreset ?? "source-serif"}
        generalSettings={generalSettings}
        readingWidth={book.meta.typography?.contentWidth}
        rightPanel={
          <div className="grid gap-8">
            <TocPanel toc={toc} />
            <ReadingMetaPanel
              backlinks={backlinks}
              updatedAt={chapter.meta.updatedAt}
            />
          </div>
        }
      >
        <PublicDocumentContent
          mode="chapter"
          title={chapter.meta.title}
          summary={chapter.meta.summary}
          markdown={chapter.body}
          manifest={manifest}
          pageId={chapter.id}
          requester="public"
          allowExecution={chapter.meta.allowExecution}
          fontPreset={chapter.meta.fontPreset ?? book.meta.fontPreset ?? "source-serif"}
          typography={book.meta.typography}
          generalSettings={generalSettings}
          bookTitle={book.meta.title}
          chapterNumber={chapterNumber}
          currentRoute={chapterRoute}
        />
      </PublicShell>
    </PublicStyleFrame>
  );
}
