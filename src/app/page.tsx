import Link from "next/link";
import { ArrowUpRight, BookOpen, NotebookPen } from "lucide-react";
import type { CSSProperties } from "react";
import { getSession } from "@/lib/auth";
import { ContentSearchLauncher } from "@/components/content-search-launcher";
import { LandingBackground } from "@/components/landing-background";
import { WorkspaceStyleFrame } from "@/components/workspace-style-frame";
import { getGeneralSettings, getPublicContentTree } from "@/lib/content/service";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = buildPublicMetadata({
  title: "WebBook Library",
  description:
    "Published books and notes arranged in a warm, markdown-first reading desk.",
  path: "/",
});

export default async function HomePage() {
  const [tree, session, generalSettings] = await Promise.all([
    getPublicContentTree(),
    getSession(),
    getGeneralSettings(),
  ]);
  const featuredBooks = [...tree.books]
    .filter((book) => book.meta.featured)
    .sort(
      (left, right) =>
        new Date(right.meta.featuredAt ?? right.meta.updatedAt).getTime() -
        new Date(left.meta.featuredAt ?? left.meta.updatedAt).getTime(),
    )
    .slice(0, 3);
  const displayFeaturedBooks = featuredBooks.length ? featuredBooks : tree.books.slice(0, 3);

  return (
    <WorkspaceStyleFrame generalSettings={generalSettings}>
      <div className="paper-shell library-shell">
        <LandingBackground />

        <div className="paper-grid gap-8">
          <header className="library-topbar">
            <div className="flex items-center gap-3">
              <span className="paper-badge">WebBook</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <ContentSearchLauncher
                scope="public"
                buttonLabel="Search"
                dialogTitle="Search the library"
                dialogDescription="Search published books, chapters, and notes from anywhere in the reading desk."
              />
              <Link
                href={session ? "/app" : "/login"}
                className="library-editor-button"
              >
                <NotebookPen className="h-4 w-4" />
                {session ? "Open editor" : "Editor access"}
              </Link>
            </div>
          </header>

          <section className="library-hero animate-rise">
            <div className="grid gap-4">
              <span className="paper-badge">WebBook library</span>
              <h1 className="max-w-5xl font-serif text-5xl leading-[0.92] tracking-[-0.05em] md:text-7xl">
                Published books and notes, arranged like a writing desk instead of a dashboard.
              </h1>
              <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
                Browse long-form books, chapter collections, and standalone notes with math,
                code, and notebook-style presentation.
              </p>
            </div>

            <div className="library-callouts">
              {displayFeaturedBooks.map((book, index) => (
                <Link
                  key={book.meta.slug}
                  href={`/books/${book.meta.slug}`}
                  className="library-callout-card"
                >
                  <div className="flex items-center gap-3 text-[var(--paper-accent)]">
                    <BookOpen className="h-4 w-4" />
                    <span className="paper-label mb-0">
                      {index === 0 ? "Featured book" : `Featured book ${index + 1}`}
                    </span>
                  </div>
                  <h2 className="mt-3 font-serif text-3xl">{book.meta.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                    {book.meta.description ?? "Start with the main published book collection."}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <div className="library-shelf-columns">
            <section className="library-section">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="paper-label">Books</p>
                  <h2 className="font-serif text-4xl leading-none">Book stack</h2>
                </div>
                <span className="paper-badge">{tree.books.length}</span>
              </div>
              <div className="moleskine-stack-grid">
                {tree.books.map((book, index) => (
                  <Link
                    key={book.meta.slug}
                    href={`/books/${book.meta.slug}`}
                    className="moleskine-stack-item moleskine-stack-book"
                    style={
                      {
                        ["--stack-shift" as string]: `${index * 18}px`,
                        ["--stack-depth" as string]: `${index}`,
                        ["--book-cover-color" as string]: book.meta.coverColor ?? "#292118",
                      } as CSSProperties
                    }
                  >
                    <span className="moleskine-stack-shadow" />
                    <div className="moleskine-stack-body">
                      <span className="moleskine-stack-spine">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div className="moleskine-stack-content">
                        <div className="flex items-center justify-between gap-3">
                          <span className="moleskine-kicker">Book</span>
                          <span className="moleskine-chip">{book.chapters.length} chapters</span>
                        </div>
                        <h3 className="moleskine-stack-title">{book.meta.title}</h3>
                        <p className="moleskine-stack-summary">
                          {book.meta.description ?? "A published WebBook collection."}
                        </p>
                        <div className="moleskine-action">
                          Read book
                          <ArrowUpRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <section className="library-section">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="paper-label">Notes</p>
                  <h2 className="font-serif text-4xl leading-none">Note stack</h2>
                </div>
                <span className="paper-badge">{tree.notes.length}</span>
              </div>
              <div className="moleskine-stack-grid">
                {tree.notes.map((note, index) => (
                  <Link
                    key={note.meta.slug}
                    href={`/notes/${note.meta.slug}`}
                    className="moleskine-stack-item moleskine-stack-note"
                    style={
                      {
                        ["--stack-shift" as string]: `${index * 18}px`,
                        ["--stack-depth" as string]: `${index}`,
                      } as CSSProperties
                    }
                  >
                    <span className="moleskine-stack-shadow" />
                    <div className="moleskine-stack-body">
                      <span className="moleskine-stack-spine moleskine-stack-spine-note" />
                      <div className="moleskine-stack-content">
                        <div className="flex items-center justify-between gap-3">
                          <span className="moleskine-kicker">Note</span>
                          <span className="moleskine-chip">{note.meta.status}</span>
                        </div>
                        <h3 className="moleskine-stack-title">{note.meta.title}</h3>
                        <p className="moleskine-stack-summary">
                          {note.meta.summary ?? "A standalone note published from the same writing desk."}
                        </p>
                        <div className="moleskine-action">
                          Open note
                          <ArrowUpRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </WorkspaceStyleFrame>
  );
}
