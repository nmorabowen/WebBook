import { BookOpen, FileText, LogOut } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DashboardCreatePanel } from "@/components/editor/dashboard-create-panel";
import { requireSession } from "@/lib/auth";
import { getContentTree } from "@/lib/content/service";

export const dynamic = "force-dynamic";

export default async function AppDashboardPage() {
  await requireSession();
  const tree = await getContentTree();

  return (
    <AppShell
      tree={tree}
      currentPath="/app"
      rightPanel={
        <div className="grid gap-6">
          <div>
            <p className="paper-label">Workspace</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Single-author editing is active. Books and notes are stored as markdown files on disk.
            </p>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="paper-button paper-button-secondary flex items-center gap-2" type="submit">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-3">
          <span className="paper-badge">Editor dashboard</span>
          <h1 className="font-serif text-5xl leading-none">Write once, publish anywhere.</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
            Create markdown-native books and notes, then publish them as public pages with math, code, and backlinks.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid gap-6">
            <DashboardCreatePanel kind="book" />
            <section className="rounded-[28px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-6">
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-[var(--paper-accent)]" />
                <h2 className="text-2xl font-semibold">Books</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {tree.books.map((book) => (
                  <a
                    key={book.meta.slug}
                    href={`/app/books/${book.meta.slug}`}
                    className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.55)] px-4 py-4 transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">{book.meta.title}</h3>
                      <span className="paper-badge">{book.chapters.length} chapters</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--paper-muted)]">
                      {book.meta.description ?? "No description yet."}
                    </p>
                  </a>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-6">
            <DashboardCreatePanel kind="note" />
            <section className="rounded-[28px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-6">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-[var(--paper-accent)]" />
                <h2 className="text-2xl font-semibold">Notes</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {tree.notes.map((note) => (
                  <a
                    key={note.meta.slug}
                    href={`/app/notes/${note.meta.slug}`}
                    className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.55)] px-4 py-4 transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold">{note.meta.title}</h3>
                      <span className="paper-badge">{note.meta.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--paper-muted)]">
                      {note.meta.summary ?? "No summary yet."}
                    </p>
                  </a>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
