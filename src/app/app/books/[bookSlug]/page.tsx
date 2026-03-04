import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreateChapterPanel } from "@/components/editor/create-chapter-panel";
import { EditorShell } from "@/components/editor/editor-shell";
import { requireSession } from "@/lib/auth";
import {
  getContentTree,
  getGeneralSettings,
  getManifest,
  listMediaForPage,
  loadRenderableContent,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export const dynamic = "force-dynamic";

export default async function AppBookPage({
  params,
}: {
  params: Promise<{ bookSlug: string }>;
}) {
  const session = await requireSession();
  const { bookSlug } = await params;
  const loaded = await loadRenderableContent(`book:${bookSlug}`);
  if (!loaded || loaded.content.kind !== "book") {
    notFound();
  }

  const [tree, manifest, generalSettings, mediaAssets] = await Promise.all([
    getContentTree(),
    getManifest(),
    getGeneralSettings(),
    listMediaForPage(loaded.content.id),
  ]);
  const toc = extractToc(loaded.content.body);
  const nextChapterOrder =
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
        manifest={manifest}
        initialValues={{
          title: loaded.content.meta.title,
          slug: loaded.content.meta.slug,
          description: loaded.content.meta.description,
          body: loaded.content.body,
          status: loaded.content.meta.status,
          featured: loaded.content.meta.featured ?? false,
          coverColor: loaded.content.meta.coverColor ?? "#292118",
          fontPreset: loaded.content.meta.fontPreset ?? "source-serif",
          typography: loaded.content.meta.typography,
        }}
        toc={toc}
        backlinks={loaded.backlinks}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        mediaAssets={mediaAssets}
        updateEndpoint={`/api/books/${loaded.content.meta.slug}`}
        shortcutScopeKey={session.username}
        extraActions={
          <CreateChapterPanel
            bookSlug={loaded.content.meta.slug}
            nextOrder={nextChapterOrder}
          />
        }
      />
    </AppShell>
  );
}
