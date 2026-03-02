import Link from "next/link";
import { ArrowLeft, BookOpenText, Search } from "lucide-react";
import type { ContentTree } from "@/lib/content/schemas";
import type { FontPreset } from "@/lib/font-presets";
import { cn } from "@/lib/utils";

type PublicShellProps = {
  tree: ContentTree;
  currentPath?: string;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  bookSlug?: string;
  fontPreset?: FontPreset;
};

export function PublicShell({
  tree,
  currentPath,
  children,
  rightPanel,
  bookSlug,
  fontPreset = "source-serif",
}: PublicShellProps) {
  const activeBook = tree.books.find((item) => item.meta.slug === bookSlug);

  return (
    <div className="paper-shell" data-font-preset={fontPreset}>
      <div className="paper-grid xl:grid-cols-[260px_minmax(0,1fr)_260px]">
        <aside className="paper-panel paper-panel-strong flex flex-col gap-5 p-6">
          <div className="grid gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--paper-muted)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to library
            </Link>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-[var(--paper-accent-soft)] p-3 text-[var(--paper-accent)]">
                <BookOpenText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--paper-muted)]">
                  WebBook
                </p>
                <h1 className="font-serif text-3xl">Reading room</h1>
              </div>
            </div>
          </div>

          {activeBook ? (
            <div className="grid gap-2">
              <Link
                href={`/books/${activeBook.meta.slug}`}
                className={cn(
                  "paper-nav-link",
                  currentPath === `/books/${activeBook.meta.slug}` &&
                    "paper-nav-link-active",
                )}
              >
                {activeBook.meta.title}
              </Link>
              {activeBook.chapters.map((chapter) => (
                <Link
                  key={`${activeBook.meta.slug}/${chapter.meta.slug}`}
                  href={`/books/${activeBook.meta.slug}/${chapter.meta.slug}`}
                  className={cn(
                    "paper-nav-link ml-4",
                    currentPath ===
                      `/books/${activeBook.meta.slug}/${chapter.meta.slug}` &&
                      "paper-nav-link-active",
                  )}
                >
                  <span>{chapter.meta.title}</span>
                  <span className="text-xs">{chapter.meta.order}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-2">
              {tree.books.map((book) => (
                <Link key={book.meta.slug} href={`/books/${book.meta.slug}`} className="paper-nav-link">
                  {book.meta.title}
                </Link>
              ))}
              {tree.notes.map((note) => (
                <Link key={note.meta.slug} href={`/notes/${note.meta.slug}`} className="paper-nav-link">
                  {note.meta.title}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-auto rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.55)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Search className="h-4 w-4 text-[var(--paper-accent)]" />
              Linked thinking
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              WebBook resolves wiki links, builds backlinks, and keeps notes publishable as their own HTML pages.
            </p>
          </div>
        </aside>

        <main className="paper-panel paper-panel-strong animate-rise p-6 md:p-10">
          {children}
        </main>

        <aside className="paper-panel hidden p-6 xl:block">{rightPanel}</aside>
      </div>
    </div>
  );
}
