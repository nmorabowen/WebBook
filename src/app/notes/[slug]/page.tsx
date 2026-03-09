import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { PublicRenderContent } from "@/components/public-render-content";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getPublicBacklinks,
  getGeneralSettings,
  getPublicManifest,
  getPublicContentTree,
  resolvePublicNoteRoute,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";
import { buildPublicMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePublicNoteRoute(slug);
  const note = resolved?.content.kind === "note" ? resolved.content : null;

  if (!note) {
    return buildPublicMetadata({
      title: "Note Not Found | WebBook",
      description: "The requested note is not published.",
      path: `/notes/${slug}`,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: `${note.meta.title} | WebBook`,
    description:
      note.meta.summary ?? `Read ${note.meta.title} on WebBook.`,
    path: `/notes/${note.meta.slug}`,
    type: "article",
    publishedTime: note.meta.publishedAt,
    modifiedTime: note.meta.updatedAt,
  });
}

export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolvePublicNoteRoute(slug);
  if (!resolved) {
    notFound();
  }
  if (resolved.content.kind !== "note" || resolved.aliased) {
    redirect(resolved.publicRoute);
  }
  const note = resolved.content;

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
