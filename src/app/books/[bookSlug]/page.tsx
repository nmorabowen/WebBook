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
  resolvePublicBookRoute,
} from "@/lib/content/service";
import { extractToc } from "@/lib/markdown/shared";
import { buildPublicMetadata } from "@/lib/seo";

type PreviewChapterNode = {
  path: string[];
  title: string;
  summary?: string;
  children: PreviewChapterNode[];
};

function mapPreviewChapters(
  chapters: NonNullable<
    Awaited<ReturnType<typeof resolvePublicBookRoute>>
  >["book"]["chapters"],
): PreviewChapterNode[] {
  return chapters.map((chapter) => ({
    path: chapter.path,
    title: chapter.meta.title,
    summary: chapter.meta.summary,
    children: mapPreviewChapters(chapter.children),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookSlug: string }>;
}): Promise<Metadata> {
  const { bookSlug } = await params;
  const book = (await resolvePublicBookRoute(bookSlug))?.book ?? null;

  if (!book) {
    return buildPublicMetadata({
      title: "Book Not Found | WebBook",
      description: "The requested book is not published.",
      path: `/books/${bookSlug}`,
      noIndex: true,
    });
  }

  return buildPublicMetadata({
    title: `${book.meta.title} | WebBook`,
    description:
      book.meta.description ?? `Read ${book.meta.title} on WebBook.`,
    path: `/books/${book.meta.slug}`,
    type: "article",
    publishedTime: book.meta.publishedAt,
    modifiedTime: book.meta.updatedAt,
  });
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ bookSlug: string }>;
}) {
  const { bookSlug } = await params;
  const resolved = await resolvePublicBookRoute(bookSlug);
  if (!resolved) {
    notFound();
  }
  if (resolved.aliased) {
    redirect(resolved.publicRoute);
  }
  const book = resolved.book;

  const [tree, manifest, backlinks, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getPublicManifest(),
    getPublicBacklinks(book.id),
    getGeneralSettings(),
  ]);
  const toc = extractToc(book.body);

  return (
    <PublicShell
      tree={tree}
      currentPath={`/books/${book.meta.slug}`}
      bookSlug={book.meta.slug}
      fontPreset={book.meta.fontPreset ?? "source-serif"}
      generalSettings={generalSettings}
      readingWidth={book.meta.typography?.contentWidth}
      rightPanel={
        <div className="grid gap-8">
          <TocPanel toc={toc} />
          <ReadingMetaPanel
            backlinks={backlinks}
            updatedAt={book.meta.updatedAt}
          />
        </div>
      }
    >
      <PublicRenderContent
        mode="book"
        title={book.meta.title}
        summary={book.meta.description}
        markdown={book.body}
        manifest={manifest}
        pageId={book.id}
        requester="public"
        fontPreset={book.meta.fontPreset ?? "source-serif"}
        typography={book.meta.typography}
        bookSlug={book.meta.slug}
        generalSettings={generalSettings}
        currentRoute={`/books/${book.meta.slug}`}
        chapters={mapPreviewChapters(book.chapters)}
      />
    </PublicShell>
  );
}
