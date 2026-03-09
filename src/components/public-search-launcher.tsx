"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ExternalLink, LoaderCircle, Search } from "lucide-react";
import type { ContentSearchResult } from "@/lib/content/schemas";
import { cn } from "@/lib/utils";

type PublicSearchLauncherProps = {
  buttonLabel?: string;
  buttonClassName?: string;
  dialogTitle?: string;
  dialogDescription?: string;
};

type SearchState = "idle" | "loading" | "ready" | "error";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function resultKindLabel(result: ContentSearchResult) {
  if (result.kind === "chapter") {
    return "Chapter";
  }

  if (result.kind === "book") {
    return "Book";
  }

  return "Note";
}

export function PublicSearchLauncher({
  buttonLabel = "Search",
  buttonClassName,
  dialogTitle = "Search the library",
  dialogDescription = "Search published books, chapters, and notes by title, summary, or indexed body text.",
}: PublicSearchLauncherProps) {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentSearchResult[]>([]);
  const [status, setStatus] = useState<SearchState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!deferredQuery) {
      setResults([]);
      setStatus("idle");
      setErrorMessage("");
      return;
    }

    const abortController = new AbortController();

    async function runSearch() {
      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(deferredQuery)}&scope=public`,
          {
            signal: abortController.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Could not load search results.");
        }

        const payload = (await response.json()) as ContentSearchResult[];
        setResults(payload);
        setStatus("ready");
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setResults([]);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load search results.",
        );
      }
    }

    void runSearch();

    return () => {
      abortController.abort();
    };
  }, [deferredQuery, isOpen]);

  const dialog = isMounted
    ? createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-[rgba(24,18,13,0.42)] px-4 py-8 backdrop-blur-[3px]"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-[28px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.97)] p-5 shadow-[0_32px_90px_rgba(24,18,13,0.26)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="paper-label mb-1">{dialogTitle}</p>
                <p className="text-sm leading-7 text-[var(--paper-muted)]">
                  {dialogDescription}
                </p>
              </div>
              <button
                type="button"
                className="paper-button paper-button-secondary px-3 py-2 text-sm"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.68)] px-4 py-3">
              <Search className="h-4 w-4 text-[var(--paper-accent)]" />
              <input
                ref={inputRef}
                type="search"
                className="w-full border-none bg-transparent p-0 text-base outline-none placeholder:text-[var(--paper-muted)]"
                placeholder="Search titles, summaries, and body text..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <span className="rounded-full border border-[var(--paper-border)] px-2 py-1 text-xs text-[var(--paper-muted)]">
                Ctrl/Cmd+K
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {!deferredQuery ? (
                <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-4 py-4 text-sm text-[var(--paper-muted)]">
                  Start typing to search indexed content.
                </div>
              ) : null}

              {status === "loading" ? (
                <div className="flex items-center gap-2 rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-4 py-4 text-sm text-[var(--paper-muted)]">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : null}

              {status === "error" ? (
                <div className="rounded-[22px] border border-[rgba(145,47,47,0.2)] bg-[rgba(145,47,47,0.08)] px-4 py-4 text-sm text-[var(--paper-danger)]">
                  {errorMessage}
                </div>
              ) : null}

              {status === "ready" && results.length === 0 ? (
                <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-4 py-4 text-sm text-[var(--paper-muted)]">
                  No indexed matches for <span className="font-semibold">{deferredQuery}</span>.
                </div>
              ) : null}

              {results.map((result) => (
                <Link
                  key={result.id}
                  href={result.route}
                  className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] px-4 py-4 transition hover:-translate-y-0.5 hover:bg-[rgba(255,255,255,0.84)]"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">
                    <span>{resultKindLabel(result)}</span>
                    <span className="paper-badge">{result.status}</span>
                    {result.bookSlug && result.kind === "chapter" ? (
                      <span>{result.bookSlug}</span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-[var(--paper-ink)]">
                        {result.title}
                      </h3>
                      <p className="mt-1 text-sm leading-7 text-[var(--paper-muted)]">
                        {result.summary || "Matched indexed body content."}
                      </p>
                      <p className="mt-2 text-xs text-[var(--paper-muted)]">{result.route}</p>
                    </div>
                    <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-[var(--paper-accent)]" />
                  </div>
                </Link>
              ))}

              {deferredQuery ? (
                <div className="flex justify-end">
                  <Link
                    href={`/search?q=${encodeURIComponent(deferredQuery)}`}
                    className="paper-button paper-button-secondary"
                  >
                    Open full results
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        className={cn("paper-button paper-button-secondary flex items-center gap-2", buttonClassName)}
        onClick={() => setIsOpen(true)}
      >
        <Search className="h-4 w-4" />
        {buttonLabel}
      </button>
      {isOpen ? dialog : null}
    </>
  );
}
