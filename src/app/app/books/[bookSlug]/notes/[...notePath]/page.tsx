import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EditorShell } from "@/components/editor/editor-shell";
import { PageMoveControls } from "@/components/editor/page-move-controls";
import { requireSession } from "@/lib/auth";
import {
  getContentTree,
  getGeneralSettings,
  getManifest,
  getNoteAtLocation,
  listMediaForPage,
  loadRenderableContent,
} from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  canAccessNote,
  filterBacklinksForScope,
  filterContentTreeForScope,
  filterManifestEntriesForScope,
  filterMediaAssetsForScope,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

/**
 * Workspace editor for a book-scoped note (Slice O).
 *
 * URL shape: `/app/books/<bookSlug>/notes/<noteSlug>` — the catch-all
 * `[...notePath]` keeps headroom for future nested-folder note layouts.
 * Today the slug is the single trailing segment; anything deeper is
 * treated as a 404 so we don't accidentally swallow chapter-scoped notes
 * that should land on a different handler.
 */
export default async function AppBookScopedNotePage({
  params,
}: {
  params: Promise<{ bookSlug: string; notePath: string[] }>;
}) {
  const session = await requireSession();
  const { bookSlug, notePath } = await params;

  if (notePath.length !== 1) {
    notFound();
  }
  const slug = notePath[0];

  const note = await getNoteAtLocation(slug, { kind: "book", bookSlug });
  if (!note) {
    // Slug not at this book's notes folder — see if it lives somewhere else
    // and redirect there so the URL stays canonical.
    notFound();
  }

  const loaded = await loadRenderableContent(note.id);
  if (!loaded || loaded.content.kind !== "note") {
    notFound();
  }

  const [rawTree, manifest, generalSettings, mediaAssets] = await Promise.all([
    getContentTree(),
    getManifest(),
    getGeneralSettings(),
    listMediaForPage(loaded.content.id),
  ]);
  const scope = await buildWorkspaceAccessScope(session, rawTree);
  if (!canAccessNote(scope, loaded.content)) {
    notFound();
  }
  const tree = filterContentTreeForScope(rawTree, scope);
  const workspaceRoute = `/app/books/${bookSlug}/notes/${slug}`;

  return (
    <AppShell
      tree={tree}
      currentPath={workspaceRoute}
      generalSettings={generalSettings}
      session={session}
      rightPanel={<div id="editor-shell-right-panel-root" />}
    >
      <EditorShell
        mode="note"
        path={`content/books/${bookSlug}/notes/${slug}.md`}
        pageId={loaded.content.id}
        publicRoute={`/books/${bookSlug}/notes/${slug}`}
        manifest={filterManifestEntriesForScope(manifest, scope)}
        initialValues={{
          title: loaded.content.meta.title,
          slug: loaded.content.meta.slug,
          summary: loaded.content.meta.summary,
          body: loaded.content.body,
          status: loaded.content.meta.status,
          fontPreset: loaded.content.meta.fontPreset ?? "archivo-narrow",
          typography: loaded.content.meta.typography,
        }}
        backlinks={filterBacklinksForScope(loaded.backlinks, scope)}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        mediaAssets={filterMediaAssetsForScope(mediaAssets, scope)}
        generalSettings={generalSettings}
        previewContext={{
          updatedAt: loaded.content.meta.updatedAt,
        }}
        updateEndpoint={`/api/notes/${slug}`}
        shortcutScopeKey={session.username}
        extraActions={
          <PageMoveControls
            mode="note"
            slug={slug}
            orderedSlugs={tree.notes
              .filter(
                (n) =>
                  n.location.kind === "book" && n.location.bookSlug === bookSlug,
              )
              .map((n) => n.meta.slug)}
            workspaceTree={tree}
            currentPath={workspaceRoute}
            canManageTopLevel={session.role === "admin"}
          />
        }
      />
    </AppShell>
  );
}
