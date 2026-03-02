import Link from "next/link";
import { ArrowRight, BookText, Braces, Calculator, PenSquare } from "lucide-react";
import { getContentTree } from "@/lib/content/service";

export default async function HomePage() {
  const tree = await getContentTree();

  return (
    <div className="paper-shell">
      <div className="paper-grid gap-8">
        <section className="paper-panel paper-panel-strong animate-rise overflow-hidden p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="grid gap-6">
              <span className="paper-badge">WebBook v1</span>
              <div className="grid gap-4">
                <h1 className="max-w-4xl font-serif text-5xl leading-[0.95] tracking-[-0.04em] md:text-7xl">
                  A book-shaped web editor for notes, chapters, equations, and live Python.
                </h1>
                <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
                  WebBook combines Obsidian-style markdown, Notion-like editing flow, and
                  clean publishing into public HTML pages with MathJax and code execution.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/app" className="paper-button inline-flex items-center gap-2">
                  Open editor
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={tree.books[0] ? `/books/${tree.books[0].meta.slug}` : "/app"}
                  className="paper-button paper-button-secondary"
                >
                  Read sample book
                </Link>
              </div>
            </div>

            <div className="grid gap-4 self-start">
              {[
                {
                  title: "MathJax first-class",
                  body: "Inline and block math render in preview and public pages.",
                  icon: Calculator,
                },
                {
                  title: "Runnable Python",
                  body: "Code cells can execute from the editor and from published pages.",
                  icon: Braces,
                },
                {
                  title: "Book + notes",
                  body: "Books keep ordered chapters, while notes can publish standalone.",
                  icon: BookText,
                },
                {
                  title: "Markdown writing",
                  body: "Wiki links, code fences, and prose remain the source of truth.",
                  icon: PenSquare,
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-5"
                >
                  <feature.icon className="h-5 w-5 text-[var(--paper-accent)]" />
                  <h2 className="mt-3 text-xl font-semibold">{feature.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                    {feature.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="paper-grid lg:grid-cols-2">
          <div className="paper-panel p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-3xl">Published books</h2>
              <span className="paper-badge">{tree.books.length}</span>
            </div>
            <div className="mt-5 grid gap-3">
              {tree.books.map((book) => (
                <Link
                  key={book.meta.slug}
                  href={`/books/${book.meta.slug}`}
                  className="rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.5)] p-5 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold">{book.meta.title}</h3>
                    <span className="paper-badge">{book.chapters.length} chapters</span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                    {book.meta.description ?? "A published WebBook collection."}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="paper-panel p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-3xl">Standalone notes</h2>
              <span className="paper-badge">{tree.notes.length}</span>
            </div>
            <div className="mt-5 grid gap-3">
              {tree.notes.map((note) => (
                <Link
                  key={note.meta.slug}
                  href={`/notes/${note.meta.slug}`}
                  className="rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.5)] p-5 transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xl font-semibold">{note.meta.title}</h3>
                    <span className="paper-badge">{note.meta.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                    {note.meta.summary ?? "A standalone note that can still live inside the same publishing system."}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
