import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MathHydrator } from "@/components/markdown/math-hydrator";
import { PublicDocumentContent } from "@/components/public-document-content";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";
import { PublicStyleFrame } from "@/components/public-style-frame";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getNoteAtLocation,
  getPublicBacklinks,
  getGeneralSettings,
  getPublicManifest,
  getPublicContentTree,
} from "@/lib/content/service";
import { containsMathSyntax, extractToc } from "@/lib/markdown/shared";
import { buildPublicMetadata } from "@/lib/seo";

/**
 * Public reader for a book-scoped note (Slice O). URL shape:
 * `/books/<bookSlug>/notes/<noteSlug>`. Mirrors `/notes/<slug>/page.tsx`
 * but verifies the note's location matches the URL — otherwise redirects
 * to the canonical route so backlinks and search results stay clean.
 */
type LoadResult =
  | { kind: "note"; note: NonNullable<Awaited<ReturnType<typeof getNoteAtLocation>>> }
  | null;

async function loadBookScopedPublishedNote(
  bookSlug: string,
  notePath: string[],
): Promise<LoadResult> {
  if (notePath.length !== 1) return null;
  const slug = notePath[0];
  const note = await getNoteAtLocation(slug, { kind: "book", bookSlug });
  if (!note) return null;
  if (note.meta.status !== "published") return null;
  return { kind: "note", note };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookSlug: string; notePath: string[] }>;
}): Promise<Metadata> {
  const { bookSlug, notePath } = await params;
  const result = await loadBookScopedPublishedNote(bookSlug, notePath);
  const note = result && result.kind === "note" ? result.note : null;

  if (!note) {
    return buildPublicMetadata({
      title: "Note Not Found | WebBook",
      description: "The requested note is not published.",
      path: `/books/${bookSlug}/notes/${notePath.join("/")}`,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: `${note.meta.title} | WebBook`,
    description: note.meta.summary ?? `Read ${note.meta.title} on WebBook.`,
    path: note.route,
    type: "article",
    publishedTime: note.meta.publishedAt,
    modifiedTime: note.meta.updatedAt,
  });
}

export default async function BookScopedNotePage({
  params,
}: {
  params: Promise<{ bookSlug: string; notePath: string[] }>;
}) {
  const { bookSlug, notePath } = await params;
  const result = await loadBookScopedPublishedNote(bookSlug, notePath);
  if (!result) notFound();

  const note = result.note;
  const [tree, manifest, backlinks, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getPublicManifest(),
    getPublicBacklinks(note.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(note.body);
  const hasMath = containsMathSyntax(note.body);

  return (
    <PublicStyleFrame generalSettings={generalSettings}>
      {hasMath ? <MathHydrator /> : null}
      <PublicShell
        tree={tree}
        currentPath={note.route}
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
        <PublicDocumentContent
          mode="note"
          title={note.meta.title}
          summary={note.meta.summary}
          markdown={note.body}
          manifest={manifest}
          pageId={note.id}
          requester="public"
          fontPreset={note.meta.fontPreset ?? "source-serif"}
          typography={note.meta.typography}
          generalSettings={generalSettings}
          currentRoute={note.route}
        />
      </PublicShell>
    </PublicStyleFrame>
  );
}
