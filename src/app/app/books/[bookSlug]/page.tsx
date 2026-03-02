import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CreateChapterPanel } from "@/components/editor/create-chapter-panel";
import { EditorShell } from "@/components/editor/editor-shell";
import { requireSession } from "@/lib/auth";
import {
  getContentTree,
  getGeneralSettings,
  getManifest,
  loadRenderableContent,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export const dynamic = "force-dynamic";

export default async function AppBookPage({
  params,
}: {
  params: Promise<{ bookSlug: string }>;
}) {
  await requireSession();
  const { bookSlug } = await params;
  const loaded = await loadRenderableContent(`book:${bookSlug}`);
  if (!loaded || loaded.content.kind !== "book") {
    notFound();
  }

  const [tree, manifest, generalSettings] = await Promise.all([
    getContentTree(),
    getManifest(),
    getGeneralSettings(),
  ]);
  const toc = extractToc(loaded.content.body);

  return (
    <AppShell
      tree={tree}
      currentPath={`/app/books/${loaded.content.meta.slug}`}
      generalSettings={generalSettings}
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
          visibility: loaded.content.meta.visibility,
          theme: loaded.content.meta.theme ?? "paper",
          fontPreset: loaded.content.meta.fontPreset ?? "source-serif",
          typography: loaded.content.meta.typography,
        }}
        toc={toc}
        backlinks={loaded.backlinks}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        updateEndpoint={`/api/books/${loaded.content.meta.slug}`}
        extraActions={
          <CreateChapterPanel
            bookSlug={loaded.content.meta.slug}
            nextOrder={loaded.content.chapters.length + 1}
          />
        }
      />
    </AppShell>
  );
}
