import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { PublicShell } from "@/components/public-shell";
import { TocPanel } from "@/components/toc-panel";
import {
  getBacklinks,
  getContentTree,
  getManifest,
  getPublicBook,
  listRevisions,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookSlug: string }>;
}) {
  const { bookSlug } = await params;
  const book = await getPublicBook(bookSlug);

  if (!book) {
    notFound();
  }

  const [tree, manifest, backlinks, revisions] = await Promise.all([
    getContentTree(),
    getManifest(),
    getBacklinks(book.id),
    listRevisions(book.id),
  ]);
  const toc = extractToc(book.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/books/${book.meta.slug}`}
      bookSlug={book.meta.slug}
      rightPanel={
        <TocPanel
          toc={toc}
          backlinks={backlinks}
          updatedAt={book.meta.updatedAt}
          revisions={revisions}
        />
      }
    >
      <div className="grid gap-8">
        <div className="grid gap-3">
          <span className="paper-badge">{book.chapters.length} chapters</span>
          <h1 className="font-serif text-6xl leading-[0.95] tracking-[-0.04em]">
            {book.meta.title}
          </h1>
          {book.meta.description ? (
            <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
              {book.meta.description}
            </p>
          ) : null}
        </div>

        <MarkdownRenderer
          markdown={book.body}
          manifest={manifest}
          pageId={book.id}
          requester="public"
          allowExecution={false}
        />
      </div>
    </PublicShell>
  );
}
