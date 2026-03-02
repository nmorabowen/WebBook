import { notFound } from "next/navigation";
import { PublicRenderContent } from "@/components/public-render-content";
import { TocPanel } from "@/components/toc-panel";
import { requireSession } from "@/lib/auth";
import {
  getBacklinks,
  getBook,
  getManifest,
  listRevisions,
  loadRenderableContent,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export default async function EditorPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ pageId?: string }>;
}) {
  await requireSession();
  const { pageId } = await searchParams;
  if (!pageId) {
    notFound();
  }

  const loaded = await loadRenderableContent(pageId);
  if (!loaded) {
    notFound();
  }

  const [manifest, backlinks, revisions] = await Promise.all([
    getManifest(),
    getBacklinks(loaded.content.id),
    listRevisions(loaded.content.id),
  ]);
  const toc = extractToc(loaded.content.body);

  if (loaded.content.kind === "note") {
    return (
      <div className="paper-shell" data-font-preset={loaded.content.meta.fontPreset ?? "source-serif"}>
        <div className="paper-grid xl:grid-cols-[minmax(0,1fr)_260px]">
          <main className="paper-panel paper-panel-strong p-6 md:p-10">
            <PublicRenderContent
              mode="note"
              title={loaded.content.meta.title}
              summary={loaded.content.meta.summary}
              markdown={loaded.content.body}
              manifest={manifest}
              pageId={loaded.content.id}
              requester="admin"
              allowExecution={loaded.content.meta.allowExecution}
              fontPreset={loaded.content.meta.fontPreset ?? "source-serif"}
            />
          </main>
          <aside className="paper-panel hidden p-6 xl:block">
            <TocPanel
              toc={toc}
              backlinks={backlinks}
              updatedAt={loaded.content.meta.updatedAt}
              revisions={revisions}
            />
          </aside>
        </div>
      </div>
    );
  }

  if (loaded.content.kind === "book") {
    const book = loaded.content;
    return (
      <div className="paper-shell" data-font-preset={book.meta.fontPreset ?? "source-serif"}>
        <div className="paper-grid xl:grid-cols-[minmax(0,1fr)_260px]">
          <main className="paper-panel paper-panel-strong p-6 md:p-10">
            <PublicRenderContent
              mode="book"
              title={book.meta.title}
              summary={book.meta.description}
              markdown={book.body}
              manifest={manifest}
              pageId={book.id}
              requester="admin"
              fontPreset={book.meta.fontPreset ?? "source-serif"}
              typography={book.meta.typography}
              bookSlug={book.meta.slug}
              chapters={book.chapters.map((chapter) => ({
                slug: chapter.meta.slug,
                title: chapter.meta.title,
                order: chapter.meta.order,
                summary: chapter.meta.summary,
              }))}
            />
          </main>
          <aside className="paper-panel hidden p-6 xl:block">
            <TocPanel
              toc={toc}
              backlinks={backlinks}
              updatedAt={book.meta.updatedAt}
              revisions={revisions}
            />
          </aside>
        </div>
      </div>
    );
  }

  if (loaded.content.kind === "chapter") {
    const chapter = loaded.content;
    const book = await getBook(chapter.meta.bookSlug);
    return (
      <div
        className="paper-shell"
        data-font-preset={chapter.meta.fontPreset ?? book.meta.fontPreset ?? "source-serif"}
      >
        <div className="paper-grid xl:grid-cols-[minmax(0,1fr)_260px]">
          <main className="paper-panel paper-panel-strong p-6 md:p-10">
            <PublicRenderContent
              mode="chapter"
              title={chapter.meta.title}
              summary={chapter.meta.summary}
              markdown={chapter.body}
              manifest={manifest}
              pageId={chapter.id}
              requester="admin"
              allowExecution={chapter.meta.allowExecution}
              fontPreset={chapter.meta.fontPreset ?? book.meta.fontPreset ?? "source-serif"}
              typography={book.meta.typography}
              bookTitle={book.meta.title}
              chapterOrder={chapter.meta.order}
            />
          </main>
          <aside className="paper-panel hidden p-6 xl:block">
            <TocPanel
              toc={toc}
              backlinks={backlinks}
              updatedAt={chapter.meta.updatedAt}
              revisions={revisions}
            />
          </aside>
        </div>
      </div>
    );
  }

  notFound();
}
