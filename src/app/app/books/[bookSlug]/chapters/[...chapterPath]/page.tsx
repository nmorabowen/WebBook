import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreateChapterPanel } from "@/components/editor/create-chapter-panel";
import { EditorShell } from "@/components/editor/editor-shell";
import { PageMoveControls } from "@/components/editor/page-move-controls";
import { requireSession } from "@/lib/auth";
import {
  getBook,
  getContentTree,
  getGeneralSettings,
  getManifest,
  listMediaForPage,
  loadRenderableContent,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export const dynamic = "force-dynamic";

export default async function AppChapterPage({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterPath: string[] }>;
}) {
  const session = await requireSession();
  const { bookSlug, chapterPath } = await params;
  const requestedPath = chapterPath ?? [];
  const location = requestedPath.join("/");
  const loaded = await loadRenderableContent(`chapter:${bookSlug}/${location}`);
  if (!loaded || loaded.content.kind !== "chapter") {
    notFound();
  }

  const [tree, manifest, book, generalSettings, mediaAssets] = await Promise.all([
    getContentTree(),
    getManifest(),
    getBook(bookSlug),
    getGeneralSettings(),
    listMediaForPage(loaded.content.id),
  ]);
  const toc = extractToc(loaded.content.body);
  const nextSubchapterOrder =
    loaded.content.children.reduce(
      (highestOrder, chapter) => Math.max(highestOrder, chapter.meta.order),
      0,
    ) + 1;
  const nextRootChapterOrder =
    book.chapters.reduce(
      (highestOrder, chapter) => Math.max(highestOrder, chapter.meta.order),
      0,
    ) + 1;
  const chapterRoutePath = loaded.content.path.join("/");

  return (
    <AppShell
      tree={tree}
      currentPath={`/app/books/${bookSlug}/chapters/${chapterRoutePath}`}
      generalSettings={generalSettings}
      session={session}
      rightPanel={<div id="editor-shell-right-panel-root" />}
    >
      <EditorShell
        mode="chapter"
        path={`content/books/${bookSlug}/chapters/**/${loaded.content.meta.slug}.md`}
        pageId={loaded.content.id}
        publicRoute={`/books/${bookSlug}/${chapterRoutePath}`}
        manifest={manifest}
        initialValues={{
          title: loaded.content.meta.title,
          slug: loaded.content.meta.slug,
          summary: loaded.content.meta.summary,
          body: loaded.content.body,
          status: loaded.content.meta.status,
          allowExecution: loaded.content.meta.allowExecution,
          fontPreset:
            loaded.content.meta.fontPreset ??
            book.meta.fontPreset ??
            "archivo-narrow",
          typography: book.meta.typography,
        }}
        toc={toc}
        backlinks={loaded.backlinks}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        mediaAssets={mediaAssets}
        updateEndpoint={`/api/books/${bookSlug}/chapters/${chapterRoutePath}`}
        shortcutScopeKey={session.username}
        extraActions={
          <>
            <PageMoveControls
              mode="chapter"
              bookSlug={book.meta.slug}
              chapterPath={loaded.content.path}
              chapterTitle={loaded.content.meta.title}
              bookChapters={book.chapters}
            />
            <CreateChapterPanel
              bookSlug={book.meta.slug}
              rootNextOrder={nextRootChapterOrder}
              currentChapterPath={loaded.content.path}
              subchapterNextOrder={nextSubchapterOrder}
            />
          </>
        }
      />
    </AppShell>
  );
}
