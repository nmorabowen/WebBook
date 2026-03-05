import { notFound } from "next/navigation";
import { PublicRenderContent } from "@/components/public-render-content";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";
import { TocPanel } from "@/components/toc-panel";
import { WorkspaceStyleFrame } from "@/components/workspace-style-frame";
import { requireSession } from "@/lib/auth";
import {
  getBacklinks,
  getBook,
  getGeneralSettings,
  getManifest,
  listRevisions,
  loadRenderableContent,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

type PreviewChapterNode = {
  path: string[];
  title: string;
  order: number;
  summary?: string;
  children: PreviewChapterNode[];
};

function mapPreviewChapters(
  chapters: Awaited<ReturnType<typeof getBook>>["chapters"],
): PreviewChapterNode[] {
  return chapters.map((chapter) => ({
    path: chapter.path,
    title: chapter.meta.title,
    order: chapter.meta.order,
    summary: chapter.meta.summary,
    children: mapPreviewChapters(chapter.children),
  }));
}

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

  const [manifest, backlinks, revisions, generalSettings] = await Promise.all([
    getManifest(),
    getBacklinks(loaded.content.id),
    listRevisions(loaded.content.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(loaded.content.body);

  if (loaded.content.kind === "note") {
    return (
      <WorkspaceStyleFrame generalSettings={generalSettings}>
        <div className="paper-shell" data-font-preset={loaded.content.meta.fontPreset ?? "source-serif"}>
          <div className="paper-grid preview-shell-layout" style={{ gap: `${generalSettings.tileSpacing}rem` }}>
            <main
              className="paper-panel paper-panel-strong p-6 md:p-10"
              style={{ borderRadius: `${generalSettings.cornerRadius}px` }}
            >
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
                typography={loaded.content.meta.typography}
                generalSettings={generalSettings}
                sourceNavigation
                currentRoute={`/notes/${loaded.content.meta.slug}`}
              />
            </main>
            <aside
              className="paper-panel hidden p-6 xl:block"
              style={{ borderRadius: `${generalSettings.cornerRadius}px` }}
            >
              <TocPanel
                toc={toc}
              />
              <div className="mt-8">
                <ReadingMetaPanel
                  backlinks={backlinks}
                  updatedAt={loaded.content.meta.updatedAt}
                  revisions={revisions}
                />
              </div>
            </aside>
          </div>
        </div>
      </WorkspaceStyleFrame>
    );
  }

  if (loaded.content.kind === "book") {
    const book = loaded.content;
    return (
      <WorkspaceStyleFrame generalSettings={generalSettings}>
        <div className="paper-shell" data-font-preset={book.meta.fontPreset ?? "source-serif"}>
          <div className="paper-grid preview-shell-layout" style={{ gap: `${generalSettings.tileSpacing}rem` }}>
            <main
              className="paper-panel paper-panel-strong p-6 md:p-10"
              style={{ borderRadius: `${generalSettings.cornerRadius}px` }}
            >
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
                generalSettings={generalSettings}
                sourceNavigation
                currentRoute={`/books/${book.meta.slug}`}
                chapters={mapPreviewChapters(book.chapters)}
              />
            </main>
            <aside
              className="paper-panel hidden p-6 xl:block"
              style={{ borderRadius: `${generalSettings.cornerRadius}px` }}
            >
              <TocPanel
                toc={toc}
              />
              <div className="mt-8">
                <ReadingMetaPanel
                  backlinks={backlinks}
                  updatedAt={book.meta.updatedAt}
                  revisions={revisions}
                />
              </div>
            </aside>
          </div>
        </div>
      </WorkspaceStyleFrame>
    );
  }

  if (loaded.content.kind === "chapter") {
    const chapter = loaded.content;
    const book = await getBook(chapter.meta.bookSlug);
    return (
      <WorkspaceStyleFrame generalSettings={generalSettings}>
        <div
          className="paper-shell"
          data-font-preset={chapter.meta.fontPreset ?? book.meta.fontPreset ?? "source-serif"}
        >
          <div className="paper-grid preview-shell-layout" style={{ gap: `${generalSettings.tileSpacing}rem` }}>
            <main
              className="paper-panel paper-panel-strong p-6 md:p-10"
              style={{ borderRadius: `${generalSettings.cornerRadius}px` }}
            >
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
                generalSettings={generalSettings}
                bookTitle={book.meta.title}
                chapterOrder={chapter.meta.order}
                sourceNavigation
                currentRoute={`/books/${book.meta.slug}/${chapter.path.join("/")}`}
              />
            </main>
            <aside
              className="paper-panel hidden p-6 xl:block"
              style={{ borderRadius: `${generalSettings.cornerRadius}px` }}
            >
              <TocPanel
                toc={toc}
              />
              <div className="mt-8">
                <ReadingMetaPanel
                  backlinks={backlinks}
                  updatedAt={chapter.meta.updatedAt}
                  revisions={revisions}
                />
              </div>
            </aside>
          </div>
        </div>
      </WorkspaceStyleFrame>
    );
  }

  notFound();
}
