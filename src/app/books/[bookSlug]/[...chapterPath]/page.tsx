import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicRenderContent } from "@/components/public-render-content";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getPublicBacklinks,
  getGeneralSettings,
  getPublicManifest,
  getPublicChapter,
  getPublicContentTree,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";
import { buildPublicMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterPath: string[] }>;
}): Promise<Metadata> {
  const { bookSlug, chapterPath } = await params;
  const requestedPath = chapterPath ?? [];
  const result = await getPublicChapter(bookSlug, requestedPath);

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
  const result = await getPublicChapter(bookSlug, requestedPath);

  if (!result) {
    notFound();
  }

  const { book, chapter } = result;
  const [tree, manifest, backlinks, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getPublicManifest(),
    getPublicBacklinks(chapter.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(chapter.body);
  const chapterRoute = `/books/${book.meta.slug}/${chapter.path.join("/")}`;

  return (
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
      <PublicRenderContent
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
        chapterOrder={chapter.meta.order}
        currentRoute={chapterRoute}
      />
    </PublicShell>
  );
}
