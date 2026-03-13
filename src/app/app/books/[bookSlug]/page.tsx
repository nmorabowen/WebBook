import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreateChapterPanel } from "@/components/editor/create-chapter-panel";
import { EditorShell } from "@/components/editor/editor-shell";
import { PageMoveControls } from "@/components/editor/page-move-controls";
import type { PreviewChapterItem } from "@/components/public-render-content";
import { requireSession } from "@/lib/auth";
import {
  getContentTree,
  getGeneralSettings,
  getManifest,
  listMediaForPage,
  loadRenderableContent,
  resolveWorkspaceBookRoute,
} from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  canAccessBook,
  filterBacklinksForScope,
  filterContentTreeForScope,
  filterManifestEntriesForScope,
  filterMediaAssetsForScope,
} from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

type PreviewChapterSource = {
  path: string[];
  meta: {
    title: string;
    summary?: string;
  };
  children: PreviewChapterSource[];
};

function mapPreviewChapters(chapters: PreviewChapterSource[]): PreviewChapterItem[] {
  return chapters.map((chapter) => ({
    path: chapter.path,
    title: chapter.meta.title,
    summary: chapter.meta.summary,
    children: mapPreviewChapters(chapter.children),
  }));
}

export default async function AppBookPage({
  params,
}: {
  params: Promise<{ bookSlug: string }>;
}) {
  const session = await requireSession();
  const { bookSlug } = await params;
  const resolved = await resolveWorkspaceBookRoute(bookSlug);
  if (!resolved) {
    notFound();
  }
  if (resolved.aliased) {
    redirect(resolved.workspaceRoute);
  }
  const loaded = await loadRenderableContent(resolved.book.id);
  if (!loaded || loaded.content.kind !== "book") {
    notFound();
  }

  const [rawTree, manifest, generalSettings, mediaAssets] = await Promise.all([
    getContentTree(),
    getManifest(),
    getGeneralSettings(),
    listMediaForPage(loaded.content.id),
  ]);
  const scope = await buildWorkspaceAccessScope(session, rawTree);
  if (!canAccessBook(scope, loaded.content)) {
    notFound();
  }
  const tree = filterContentTreeForScope(rawTree, scope);
  const nextRootChapterOrder =
    loaded.content.chapters.reduce(
      (highestOrder, chapter) => Math.max(highestOrder, chapter.meta.order),
      0,
    ) + 1;

  return (
    <AppShell
      tree={tree}
      currentPath={`/app/books/${loaded.content.meta.slug}`}
      generalSettings={generalSettings}
      session={session}
      rightPanel={<div id="editor-shell-right-panel-root" />}
    >
      <EditorShell
        mode="book"
        path={`content/books/${loaded.content.meta.slug}/book.md`}
        pageId={loaded.content.id}
        publicRoute={`/books/${loaded.content.meta.slug}`}
        manifest={filterManifestEntriesForScope(manifest, scope)}
        initialValues={{
          title: loaded.content.meta.title,
          slug: loaded.content.meta.slug,
          description: loaded.content.meta.description,
          body: loaded.content.body,
          status: loaded.content.meta.status,
          featured: loaded.content.meta.featured ?? false,
          coverColor: loaded.content.meta.coverColor ?? "#292118",
          fontPreset: loaded.content.meta.fontPreset ?? "archivo-narrow",
          typography: loaded.content.meta.typography,
        }}
        backlinks={filterBacklinksForScope(loaded.backlinks, scope)}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        mediaAssets={filterMediaAssetsForScope(mediaAssets, scope)}
        generalSettings={generalSettings}
        previewContext={{
          chapters: mapPreviewChapters(loaded.content.chapters),
          updatedAt: loaded.content.meta.updatedAt,
        }}
        updateEndpoint={`/api/books/${loaded.content.meta.slug}`}
        shortcutScopeKey={session.username}
        extraActions={
          <>
            <PageMoveControls
              mode="book"
              slug={loaded.content.meta.slug}
              orderedSlugs={tree.books.map((book) => book.meta.slug)}
              workspaceTree={tree}
              currentPath={`/app/books/${loaded.content.meta.slug}`}
              canManageTopLevel={session.role === "admin"}
            />
            <CreateChapterPanel
              bookSlug={loaded.content.meta.slug}
              rootNextOrder={nextRootChapterOrder}
            />
          </>
        }
      />
    </AppShell>
  );
}
