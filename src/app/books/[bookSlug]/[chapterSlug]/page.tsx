import { notFound } from "next/navigation";
import { PublicRenderContent } from "@/components/public-render-content";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getBacklinks,
  getGeneralSettings,
  getManifest,
  getPublicChapter,
  getPublicContentTree,
  listRevisions,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterSlug: string }>;
}) {
  const { bookSlug, chapterSlug } = await params;
  const result = await getPublicChapter(bookSlug, chapterSlug);

  if (!result) {
    notFound();
  }

  const { book, chapter } = result;
  const [tree, manifest, backlinks, revisions, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getManifest(),
    getBacklinks(chapter.id),
    listRevisions(chapter.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(chapter.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/books/${book.meta.slug}/${chapter.meta.slug}`}
      bookSlug={book.meta.slug}
      fontPreset={chapter.meta.fontPreset ?? book.meta.fontPreset ?? "source-serif"}
      generalSettings={generalSettings}
      readingWidth={book.meta.typography?.contentWidth}
      rightPanel={
        <TocPanel
          toc={toc}
          backlinks={backlinks}
          updatedAt={chapter.meta.updatedAt}
          revisions={revisions}
        />
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
      />
    </PublicShell>
  );
}
