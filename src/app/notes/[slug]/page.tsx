import { notFound } from "next/navigation";
import { PublicRenderContent } from "@/components/public-render-content";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getPublicBacklinks,
  getGeneralSettings,
  getPublicManifest,
  getPublicContentTree,
  getPublicNote,
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

  const [tree, manifest, backlinks, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getPublicManifest(),
    getPublicBacklinks(note.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(note.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/notes/${note.meta.slug}`}
      fontPreset={note.meta.fontPreset ?? "source-serif"}
      generalSettings={generalSettings}
      readingWidth={note.meta.typography?.contentWidth}
      rightPanel={
        <div className="grid gap-8">
          <TocPanel toc={toc} />
          <ReadingMetaPanel
            backlinks={backlinks}
            updatedAt={note.meta.updatedAt}
          />
        </div>
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
        typography={note.meta.typography}
        generalSettings={generalSettings}
        currentRoute={`/notes/${note.meta.slug}`}
      />
    </PublicShell>
  );
}
