import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreateChapterPanel } from "@/components/editor/create-chapter-panel";
import { EditorShell } from "@/components/editor/editor-shell";
import { PageMoveControls } from "@/components/editor/page-move-controls";
import { requireSession } from "@/lib/auth";
import { getChapterNumberByPath } from "@/lib/chapter-numbering";
import {
  getContentTree,
  getGeneralSettings,
  getManifest,
  listMediaForPage,
  loadRenderableContent,
  resolveWorkspaceChapterRoute,
} from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  canAccessChapter,
  filterBacklinksForScope,
  filterContentTreeForScope,
  filterManifestEntriesForScope,
  filterMediaAssetsForScope,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export default async function AppChapterPage({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterPath: string[] }>;
}) {
  const session = await requireSession();
  const { bookSlug, chapterPath } = await params;
  const requestedPath = chapterPath ?? [];
  const resolved = await resolveWorkspaceChapterRoute(bookSlug, requestedPath);
  if (!resolved) {
    notFound();
  }
  if (resolved.aliased) {
    redirect(resolved.workspaceRoute);
  }
  const loaded = await loadRenderableContent(resolved.chapter.id);
  if (!loaded || loaded.content.kind !== "chapter") {
    notFound();
  }

  const [rawTree, manifest, generalSettings, mediaAssets] = await Promise.all([
    getContentTree(),
    getManifest(),
    getGeneralSettings(),
    listMediaForPage(loaded.content.id),
  ]);
  const scope = await buildWorkspaceAccessScope(session, rawTree);
  if (!canAccessChapter(scope, loaded.content)) {
    notFound();
  }
  const tree = filterContentTreeForScope(rawTree, scope);
  const book = resolved.book;
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
  const chapterNumber =
    getChapterNumberByPath(book.chapters, loaded.content.path) ??
    String(loaded.content.meta.order);

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
        manifest={filterManifestEntriesForScope(manifest, scope)}
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
        backlinks={filterBacklinksForScope(loaded.backlinks, scope)}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        mediaAssets={filterMediaAssetsForScope(mediaAssets, scope)}
        generalSettings={generalSettings}
        previewContext={{
          bookTitle: book.meta.title,
          chapterNumber,
          updatedAt: loaded.content.meta.updatedAt,
        }}
        updateEndpoint={`/api/books/${bookSlug}/chapters/${chapterRoutePath}`}
        shortcutScopeKey={session.username}
        extraActions={[
          <PageMoveControls
            key="move-controls"
            mode="chapter"
            bookSlug={book.meta.slug}
            chapterPath={loaded.content.path}
            chapterTitle={loaded.content.meta.title}
            bookChapters={book.chapters}
            workspaceTree={tree}
            currentPath={`/app/books/${bookSlug}/chapters/${chapterRoutePath}`}
            canManageTopLevel={session.role === "admin"}
          />,
          <CreateChapterPanel
            key="create-chapter"
            bookSlug={book.meta.slug}
            rootNextOrder={nextRootChapterOrder}
            currentChapterPath={loaded.content.path}
            subchapterNextOrder={nextSubchapterOrder}
          />,
        ]}
      />
    </AppShell>
  );
}
