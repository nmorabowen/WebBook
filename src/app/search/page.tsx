import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { PublicShell } from "@/components/public-shell";
import { getGeneralSettings, getPublicContentTree, searchPublicContent } from "@/lib/content/service";
import { buildPublicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q = "" } = await searchParams;
  const query = q.trim();

  return buildPublicMetadata({
    title: query ? `Search: ${query} | WebBook` : "Search | WebBook",
    description: query
      ? `Search results for ${query} across published WebBook content.`
      : "Search published books, chapters, and notes on WebBook.",
    path: query ? `/search?q=${encodeURIComponent(query)}` : "/search",
    noIndex: true,
  });
}

function resultKindLabel(kind: "book" | "chapter" | "note") {
  if (kind === "chapter") {
    return "Chapter";
  }

  if (kind === "book") {
    return "Book";
  }

  return "Note";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const [tree, generalSettings, results] = await Promise.all([
    getPublicContentTree(),
    getGeneralSettings(),
    query ? searchPublicContent(query) : Promise.resolve([]),
  ]);

  return (
    <PublicShell
      tree={tree}
      currentPath="/search"
      generalSettings={generalSettings}
      rightPanel={
        <div className="grid gap-6">
          <section>
            <p className="paper-label">Search tips</p>
            <div className="grid gap-2 text-sm leading-7 text-[var(--paper-muted)]">
              <p>Search titles, summaries, or body text.</p>
              <p>Prefix matching is enabled, so partial words work.</p>
              <p>Results only include published content.</p>
            </div>
          </section>
          {query ? (
            <section>
              <p className="paper-label">Current query</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">{query}</p>
            </section>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-3">
          <span className="paper-badge">Library search</span>
          <h1 className="font-serif text-5xl leading-none">Search published content.</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
            Find books, chapters, and standalone notes across the public library.
          </p>
        </div>

        <form
          action="/search"
          method="get"
          className="flex flex-col gap-3 rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-4 md:flex-row"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.82)] px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-[var(--paper-accent)]" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search titles, summaries, and body text..."
              className="w-full border-none bg-transparent p-0 outline-none placeholder:text-[var(--paper-muted)]"
            />
          </div>
          <button type="submit" className="paper-button justify-center">
            Search
          </button>
        </form>

        {query ? (
          <p className="text-sm text-[var(--paper-muted)]">
            {results.length} result{results.length === 1 ? "" : "s"} for{" "}
            <span className="font-semibold text-[var(--paper-ink)]">{query}</span>
          </p>
        ) : (
          <p className="text-sm text-[var(--paper-muted)]">
            Enter a query to search the public library.
          </p>
        )}

        <div className="grid gap-3">
          {results.map((result) => (
            <Link
              key={result.id}
              href={result.route}
              className="rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] px-5 py-4 transition hover:-translate-y-0.5 hover:bg-[rgba(255,255,255,0.84)]"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">
                <span>{resultKindLabel(result.kind)}</span>
                <span className="paper-badge">{result.status}</span>
                {result.kind === "chapter" && result.bookSlug ? (
                  <span>{result.bookSlug}</span>
                ) : null}
              </div>
              <h2 className="mt-2 text-2xl font-semibold">{result.title}</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                {result.summary || "Matched indexed body content."}
              </p>
              <p className="mt-3 text-xs text-[var(--paper-muted)]">{result.route}</p>
            </Link>
          ))}

          {query && results.length === 0 ? (
            <div className="rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] px-5 py-4 text-sm leading-7 text-[var(--paper-muted)]">
              No published matches were found. Try a broader keyword or a partial word.
            </div>
          ) : null}
        </div>
      </div>
    </PublicShell>
  );
}
