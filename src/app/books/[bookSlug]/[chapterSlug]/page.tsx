import { notFound } from "next/navigation";
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
  const [tree, manifest, backlinks, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getPublicManifest(),
    getPublicBacklinks(chapter.id),
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
        currentRoute={`/books/${book.meta.slug}/${chapter.meta.slug}`}
      />
    </PublicShell>
  );
}
