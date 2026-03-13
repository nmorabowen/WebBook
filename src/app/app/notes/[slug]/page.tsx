import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EditorShell } from "@/components/editor/editor-shell";
import { PageMoveControls } from "@/components/editor/page-move-controls";
import { requireSession } from "@/lib/auth";
import {
  getContentTree,
  getGeneralSettings,
  getManifest,
  listMediaForPage,
  loadRenderableContent,
  resolveWorkspaceNoteRoute,
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

export default async function AppNotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;
  const resolved = await resolveWorkspaceNoteRoute(slug);
  if (!resolved) {
    notFound();
  }
  if (resolved.aliased || resolved.content.kind !== "note") {
    redirect(resolved.workspaceRoute);
  }
  const loaded = await loadRenderableContent(resolved.content.id);
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
  return (
    <AppShell
      tree={tree}
      currentPath={`/app/notes/${loaded.content.meta.slug}`}
      generalSettings={generalSettings}
      session={session}
      rightPanel={<div id="editor-shell-right-panel-root" />}
    >
      <EditorShell
        mode="note"
        path={`content/notes/${loaded.content.meta.slug}.md`}
        pageId={loaded.content.id}
        publicRoute={`/notes/${loaded.content.meta.slug}`}
        manifest={filterManifestEntriesForScope(manifest, scope)}
        initialValues={{
          title: loaded.content.meta.title,
          slug: loaded.content.meta.slug,
          summary: loaded.content.meta.summary,
          body: loaded.content.body,
          status: loaded.content.meta.status,
          allowExecution: loaded.content.meta.allowExecution,
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
        updateEndpoint={`/api/notes/${loaded.content.meta.slug}`}
        shortcutScopeKey={session.username}
        extraActions={
          <PageMoveControls
            mode="note"
            slug={loaded.content.meta.slug}
            orderedSlugs={tree.notes.map((note) => note.meta.slug)}
            workspaceTree={tree}
            currentPath={`/app/notes/${loaded.content.meta.slug}`}
            canManageTopLevel={session.role === "admin"}
          />
        }
      />
    </AppShell>
  );
}
