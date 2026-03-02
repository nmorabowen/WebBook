import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getBacklinks,
  getContentTree,
  getManifest,
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
    getContentTree(),
    getManifest(),
    getBacklinks(note.id),
    listRevisions(note.id),
  ]);
  const toc = extractToc(note.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/notes/${note.meta.slug}`}
      rightPanel={
        <TocPanel
          toc={toc}
          backlinks={backlinks}
          updatedAt={note.meta.updatedAt}
          revisions={revisions}
        />
      }
    >
      <div className="grid gap-8">
        <div className="grid gap-3">
          <span className="paper-badge">Standalone note</span>
          <h1 className="font-serif text-6xl leading-[0.95] tracking-[-0.04em]">
            {note.meta.title}
          </h1>
          {note.meta.summary ? (
            <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
              {note.meta.summary}
            </p>
          ) : null}
        </div>

        <MarkdownRenderer
          markdown={note.body}
          manifest={manifest}
          pageId={note.id}
          requester="public"
          allowExecution={note.meta.allowExecution}
        />
      </div>
    </PublicShell>
  );
}
