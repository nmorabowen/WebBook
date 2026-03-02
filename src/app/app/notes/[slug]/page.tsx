import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EditorShell } from "@/components/editor/editor-shell";
import { requireSession } from "@/lib/auth";
import {
  getContentTree,
  getManifest,
  loadRenderableContent,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export default async function AppNotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireSession();
  const { slug } = await params;
  const loaded = await loadRenderableContent(`note:${slug}`);
  if (!loaded || loaded.content.kind !== "note") {
    notFound();
  }

  const [tree, manifest] = await Promise.all([getContentTree(), getManifest()]);
  const toc = extractToc(loaded.content.body);

  return (
    <AppShell tree={tree} currentPath={`/app/notes/${loaded.content.meta.slug}`}>
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
          visibility: loaded.content.meta.visibility,
          allowExecution: loaded.content.meta.allowExecution,
          fontPreset: loaded.content.meta.fontPreset ?? "source-serif",
        }}
        toc={toc}
        backlinks={loaded.backlinks}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        updateEndpoint={`/api/notes/${loaded.content.meta.slug}`}
      />
    </AppShell>
  );
}
