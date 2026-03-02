import { notFound } from "next/navigation";
import { PublicRenderContent } from "@/components/public-render-content";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getBacklinks,
  getManifest,
  getPublicContentTree,
  getPublicNote,
  listRevisions,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const note = await getPublicNote(slug);

  if (!note) {
    notFound();
  }

  const [tree, manifest, backlinks, revisions] = await Promise.all([
    getPublicContentTree(),
    getManifest(),
    getBacklinks(note.id),
    listRevisions(note.id),
  ]);
  const toc = extractToc(note.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/notes/${note.meta.slug}`}
      fontPreset={note.meta.fontPreset ?? "source-serif"}
      rightPanel={
        <TocPanel
          toc={toc}
          backlinks={backlinks}
          updatedAt={note.meta.updatedAt}
          revisions={revisions}
        />
      }
    >
      <PublicRenderContent
        mode="note"
        title={note.meta.title}
        summary={note.meta.summary}
        markdown={note.body}
        manifest={manifest}
        pageId={note.id}
        requester="public"
        allowExecution={note.meta.allowExecution}
        fontPreset={note.meta.fontPreset ?? "source-serif"}
      />
    </PublicShell>
  );
}
