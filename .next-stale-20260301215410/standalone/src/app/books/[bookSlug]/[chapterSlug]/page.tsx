import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getBacklinks,
  getContentTree,
  getManifest,
  getPublicChapter,
  listRevisions,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ bookSlug: string; chapterSlug: string }>;
}) {
  const { bookSlug, chapterSlug } = await params;
  const result = await getPublicChapter(bookSlug, chapterSlug);

  if (!result) {
    notFound();
  }

  const { book, chapter } = result;
  const [tree, manifest, backlinks, revisions] = await Promise.all([
    getContentTree(),
    getManifest(),
    getBacklinks(chapter.id),
    listRevisions(chapter.id),
  ]);
  const toc = extractToc(chapter.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/books/${book.meta.slug}/${chapter.meta.slug}`}
      bookSlug={book.meta.slug}
      rightPanel={
        <TocPanel
          toc={toc}
          backlinks={backlinks}
          updatedAt={chapter.meta.updatedAt}
          revisions={revisions}
        />
      }
    >
      <div className="grid gap-8">
        <div className="grid gap-3">
          <span className="paper-badge">
            Chapter {chapter.meta.order} of {book.meta.title}
          </span>
          <h1 className="font-serif text-6xl leading-[0.95] tracking-[-0.04em]">
            {chapter.meta.title}
          </h1>
          {chapter.meta.summary ? (
            <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
              {chapter.meta.summary}
            </p>
          ) : null}
        </div>

        <MarkdownRenderer
          markdown={chapter.body}
          manifest={manifest}
          pageId={chapter.id}
          requester="public"
          allowExecution={chapter.meta.allowExecution}
        />
      </div>
    </PublicShell>
  );
}
