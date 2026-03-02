import Link from "next/link";
import { BookMarked, FileText, Home, PenSquare } from "lucide-react";
import type { ContentTree } from "@/lib/content/schemas";
import { cn } from "@/lib/utils";

type AppShellProps = {
  tree: ContentTree;
  currentPath?: string;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
};

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn("paper-nav-link", active && "paper-nav-link-active")}
    >
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({ tree, currentPath, children, rightPanel }: AppShellProps) {
  return (
    <div className="paper-shell">
      <div className="paper-grid xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="paper-panel paper-panel-strong flex flex-col gap-6 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--paper-muted)]">
                WebBook
              </p>
              <h1 className="mt-2 font-serif text-3xl leading-none">Authoring desk</h1>
            </div>
            <Link href="/" className="paper-button paper-button-secondary p-3">
              <Home className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-2">
            <NavLink href="/app" label="Dashboard" active={currentPath === "/app"} />
          </div>

          <section className="grid gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <BookMarked className="h-4 w-4" />
              Books
            </div>
            <div className="grid gap-2">
              {tree.books.map((book) => (
                <div key={book.meta.slug} className="grid gap-1">
                  <NavLink
                    href={`/app/books/${book.meta.slug}`}
                    label={book.meta.title}
                    active={currentPath === `/app/books/${book.meta.slug}`}
                  />
                  {book.chapters.map((chapter) => (
                    <NavLink
                      key={`${book.meta.slug}/${chapter.meta.slug}`}
                      href={`/app/books/${book.meta.slug}/chapters/${chapter.meta.slug}`}
                      label={`Chapter ${chapter.meta.order}: ${chapter.meta.title}`}
                      active={
                        currentPath ===
                        `/app/books/${book.meta.slug}/chapters/${chapter.meta.slug}`
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <FileText className="h-4 w-4" />
              Notes
            </div>
            <div className="grid gap-2">
              {tree.notes.map((note) => (
                <NavLink
                  key={note.meta.slug}
                  href={`/app/notes/${note.meta.slug}`}
                  label={note.meta.title}
                  active={currentPath === `/app/notes/${note.meta.slug}`}
                />
              ))}
            </div>
          </section>

          <div className="mt-auto rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.55)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PenSquare className="h-4 w-4 text-[var(--paper-accent)]" />
              Markdown-first
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Write directly in markdown, preview MathJax live, and publish without switching tools.
            </p>
          </div>
        </aside>

        <main className="paper-panel paper-panel-strong p-5 md:p-7">{children}</main>

        <aside className="paper-panel hidden p-6 xl:block">{rightPanel}</aside>
      </div>
    </div>
  );
}
