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

export default async function AppChapterPage({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterSlug: string }>;
}) {
  await requireSession();
  const { bookSlug, chapterSlug } = await params;
  const loaded = await loadRenderableContent(`chapter:${bookSlug}/${chapterSlug}`);
  if (!loaded || loaded.content.kind !== "chapter") {
    notFound();
  }

  const [tree, manifest] = await Promise.all([getContentTree(), getManifest()]);
  const toc = extractToc(loaded.content.body);

  return (
    <AppShell
      tree={tree}
      currentPath={`/app/books/${bookSlug}/chapters/${loaded.content.meta.slug}`}
    >
      <EditorShell
        mode="chapter"
        path={`content/books/${bookSlug}/chapters/*-${loaded.content.meta.slug}.md`}
        pageId={loaded.content.id}
        publicRoute={`/books/${bookSlug}/${loaded.content.meta.slug}`}
        manifest={manifest}
        initialValues={{
          title: loaded.content.meta.title,
          slug: loaded.content.meta.slug,
          summary: loaded.content.meta.summary,
          body: loaded.content.body,
          status: loaded.content.meta.status,
          allowExecution: loaded.content.meta.allowExecution,
          order: loaded.content.meta.order,
        }}
        toc={toc}
        backlinks={loaded.backlinks}
        unresolvedLinks={loaded.unresolvedLinks}
        revisions={loaded.revisions}
        updateEndpoint={`/api/books/${bookSlug}/chapters/${loaded.content.meta.slug}`}
      />
    </AppShell>
  );
}
