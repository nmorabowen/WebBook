import { notFound } from "next/navigation";
import { PublicRenderContent } from "@/components/public-render-content";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getBacklinks,
  getGeneralSettings,
  getManifest,
  getPublicBook,
  getPublicContentTree,
  listRevisions,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookSlug: string }>;
}) {
  const { bookSlug } = await params;
  const book = await getPublicBook(bookSlug);

  if (!book) {
    notFound();
  }

  const [tree, manifest, backlinks, revisions, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getManifest(),
    getBacklinks(book.id),
    listRevisions(book.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(book.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/books/${book.meta.slug}`}
      bookSlug={book.meta.slug}
      fontPreset={book.meta.fontPreset ?? "source-serif"}
      generalSettings={generalSettings}
      readingWidth={book.meta.typography?.contentWidth}
      rightPanel={
        <TocPanel
          toc={toc}
          backlinks={backlinks}
          updatedAt={book.meta.updatedAt}
          revisions={revisions}
        />
      }
    >
      <PublicRenderContent
        mode="book"
        title={book.meta.title}
        summary={book.meta.description}
        markdown={book.body}
        manifest={manifest}
        pageId={book.id}
        requester="public"
        fontPreset={book.meta.fontPreset ?? "source-serif"}
        typography={book.meta.typography}
        bookSlug={book.meta.slug}
        generalSettings={generalSettings}
        chapters={book.chapters.map((chapter) => ({
          slug: chapter.meta.slug,
          title: chapter.meta.title,
          order: chapter.meta.order,
          summary: chapter.meta.summary,
        }))}
      />
    </PublicShell>
  );
}
