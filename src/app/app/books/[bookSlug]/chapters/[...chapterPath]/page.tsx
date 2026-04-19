import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreateChapterPanel } from "@/components/editor/create-chapter-panel";
import { EditorShell } from "@/components/editor/editor-shell";
import { PageMoveControls } from "@/components/editor/page-move-controls";
import { requireSession } from "@/lib/auth";
import { getChapterNumberByPath } from "@/lib/chapter-numbering";
import { detectChapterScopedNote } from "@/lib/content/chapter-scoped-note-route";
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
  canAccessNote,
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

  // Chapter-scoped notes ride this catch-all because Next.js does not
  // allow two catch-all segments in a single route. When the URL ends in
  // `/notes/<slug>` and a real chapter-scoped note exists, render the
  // note editor inline instead of falling through to the chapter loader.
  const scopedNote = await detectChapterScopedNote(bookSlug, requestedPath);
  if (scopedNote) {
    const loadedNote = await loadRenderableContent(scopedNote.note.id);
    if (!loadedNote || loadedNote.content.kind !== "note") notFound();
    const [rawTreeForNote, manifestForNote, generalSettingsForNote, mediaForNote] =
      await Promise.all([
        getContentTree(),
        getManifest(),
        getGeneralSettings(),
        listMediaForPage(loadedNote.content.id),
      ]);
    const noteScope = await buildWorkspaceAccessScope(session, rawTreeForNote);
    if (!canAccessNote(noteScope, loadedNote.content)) notFound();
    const filteredTreeForNote = filterContentTreeForScope(rawTreeForNote, noteScope);
    const noteWorkspaceRoute = `/app/books/${bookSlug}/chapters/${scopedNote.chapterPath.join("/")}/notes/${scopedNote.noteSlug}`;
    return (
      <AppShell
        tree={filteredTreeForNote}
        currentPath={noteWorkspaceRoute}
        generalSettings={generalSettingsForNote}
        session={session}
        rightPanel={<div id="editor-shell-right-panel-root" />}
      >
        <EditorShell
          mode="note"
          path={`content/books/${bookSlug}/chapters/${scopedNote.chapterPath.join("/")}/notes/${scopedNote.noteSlug}.md`}
          pageId={loadedNote.content.id}
          publicRoute={`/books/${bookSlug}/chapters/${scopedNote.chapterPath.join("/")}/notes/${scopedNote.noteSlug}`}
          manifest={filterManifestEntriesForScope(manifestForNote, noteScope)}
          initialValues={{
            title: loadedNote.content.meta.title,
            slug: loadedNote.content.meta.slug,
            summary: loadedNote.content.meta.summary,
            body: loadedNote.content.body,
            status: loadedNote.content.meta.status,
            fontPreset: loadedNote.content.meta.fontPreset ?? "archivo-narrow",
            typography: loadedNote.content.meta.typography,
          }}
          backlinks={filterBacklinksForScope(loadedNote.backlinks, noteScope)}
          unresolvedLinks={loadedNote.unresolvedLinks}
          revisions={loadedNote.revisions}
          mediaAssets={filterMediaAssetsForScope(mediaForNote, noteScope)}
          generalSettings={generalSettingsForNote}
          previewContext={{ updatedAt: loadedNote.content.meta.updatedAt }}
          updateEndpoint={`/api/notes/${scopedNote.noteSlug}`}
          shortcutScopeKey={session.username}
        />
      </AppShell>
    );
  }

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
