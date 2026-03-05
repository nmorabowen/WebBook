import { notFound } from "next/navigation";
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
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export const dynamic = "force-dynamic";

export default async function AppNotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;
  const loaded = await loadRenderableContent(`note:${slug}`);
  if (!loaded || loaded.content.kind !== "note") {
    notFound();
  }

  const [tree, manifest, generalSettings, mediaAssets] = await Promise.all([
    getContentTree(),
    getManifest(),
    getGeneralSettings(),
    listMediaForPage(loaded.content.id),
  ]);
  const toc = extractToc(loaded.content.body);

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
        manifest={manifest}
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
        toc={toc}
        backlinks={loaded.backlinks}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        mediaAssets={mediaAssets}
        updateEndpoint={`/api/notes/${loaded.content.meta.slug}`}
        shortcutScopeKey={session.username}
        extraActions={
          <PageMoveControls
            mode="note"
            slug={loaded.content.meta.slug}
            orderedSlugs={tree.notes.map((note) => note.meta.slug)}
          />
        }
      />
    </AppShell>
  );
}
