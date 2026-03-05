"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ExternalLink, LoaderCircle, Search } from "lucide-react";
import { ChapterMoveDialog } from "@/components/chapter-move-dialog";
import type { ContentSearchResult, ContentTree } from "@/lib/content/schemas";
import { useCommandCatalog } from "@/components/workspace/use-command-catalog";
import type { WorkspaceChapterMoveRequest } from "@/components/workspace/types";
import { useWorkspaceTreeActions } from "@/components/workspace/use-workspace-tree-actions";
import { cn } from "@/lib/utils";

type ContentSearchLauncherProps = {
  scope: "public" | "workspace";
  buttonLabel?: string;
  buttonClassName?: string;
  dialogTitle?: string;
  dialogDescription?: string;
  workspaceTree?: Pick<ContentTree, "books" | "notes">;
  workspaceCurrentPath?: string;
};

type SearchState = "idle" | "loading" | "ready" | "error";
type LauncherMode = "search" | "commands";

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

export function ContentSearchLauncher({
  scope,
  buttonLabel = "Search",
  buttonClassName,
  dialogTitle = "Search WebBook",
  dialogDescription = "Find books, chapters, and notes from the indexed markdown workspace.",
  workspaceTree,
  workspaceCurrentPath,
}: ContentSearchLauncherProps) {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<LauncherMode>("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContentSearchResult[]>([]);
  const [status, setStatus] = useState<SearchState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [commandErrorMessage, setCommandErrorMessage] = useState("");
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [chapterMoveRequest, setChapterMoveRequest] =
    useState<WorkspaceChapterMoveRequest | null>(null);
  const [chapterMoveError, setChapterMoveError] = useState<string | null>(null);
  const [isChapterMovePending, setIsChapterMovePending] = useState(false);
  const deferredQuery = useDeferredValue(query.trim());
  const normalizedQuery = deferredQuery.toLowerCase();
  const hasWorkspaceCommands = scope === "workspace" && Boolean(workspaceTree);
  const treeForCommands = workspaceTree ?? { books: [], notes: [] };
  const workspaceActions = useWorkspaceTreeActions(workspaceCurrentPath);

  const commandCatalog = useCommandCatalog({
    tree: treeForCommands,
    currentPath: workspaceCurrentPath ?? pathname,
    actions: workspaceActions,
    onOpenChapterMove: (request) => {
      setChapterMoveError(null);
      setIsOpen(false);
      setChapterMoveRequest(request);
    },
  });

  const visibleCommands = useMemo(() => {
    if (!hasWorkspaceCommands) {
      return [];
    }
    if (!normalizedQuery) {
      return commandCatalog;
    }

    return commandCatalog.filter(
      (command) =>
        command.label.toLowerCase().includes(normalizedQuery) ||
        command.context.toLowerCase().includes(normalizedQuery) ||
        command.keywords.includes(normalizedQuery),
    );
  }, [commandCatalog, hasWorkspaceCommands, normalizedQuery]);

  const moveTargetBook = useMemo(() => {
    if (!workspaceTree || !chapterMoveRequest) {
      return null;
    }
    return (
      workspaceTree.books.find((book) => book.meta.slug === chapterMoveRequest.bookSlug) ??
      null
    );
  }, [chapterMoveRequest, workspaceTree]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!hasWorkspaceCommands && mode === "commands") {
      setMode("search");
    }
  }, [hasWorkspaceCommands, mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    inputRef.current?.focus();
  }, [isOpen, mode]);

  useEffect(() => {
    if (!visibleCommands.length) {
      setActiveCommandIndex(0);
      return;
    }
    setActiveCommandIndex((current) =>
      Math.max(0, Math.min(visibleCommands.length - 1, current)),
    );
  }, [visibleCommands]);

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
    if (!isOpen || mode !== "search") {
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
          `/api/search?q=${encodeURIComponent(deferredQuery)}&scope=${scope}`,
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
  }, [deferredQuery, isOpen, mode, scope]);

  const runCommand = async (index: number) => {
    const command = visibleCommands[index];
    if (!command || command.disabledReason) {
      return;
    }

    setCommandErrorMessage("");
    setPendingCommandId(command.id);

    try {
      await Promise.resolve(command.run());
      setIsOpen(false);
    } catch (error) {
      setCommandErrorMessage(
        error instanceof Error ? error.message : "Command failed.",
      );
    } finally {
      setPendingCommandId(null);
    }
  };

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

            {hasWorkspaceCommands ? (
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "paper-button px-3 py-1.5 text-sm",
                    mode !== "search" && "paper-button-secondary",
                  )}
                  onClick={() => setMode("search")}
                >
                  Search
                </button>
                <button
                  type="button"
                  className={cn(
                    "paper-button px-3 py-1.5 text-sm",
                    mode !== "commands" && "paper-button-secondary",
                  )}
                  onClick={() => setMode("commands")}
                >
                  Commands
                </button>
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-3 rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.68)] px-4 py-3">
              <Search className="h-4 w-4 text-[var(--paper-accent)]" />
              <input
                ref={inputRef}
                type="search"
                className="w-full border-none bg-transparent p-0 text-base outline-none placeholder:text-[var(--paper-muted)]"
                placeholder={
                  mode === "commands"
                    ? "Search move/reorder commands..."
                    : "Search titles, summaries, and body text..."
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (mode !== "commands") {
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveCommandIndex((current) =>
                      Math.min(visibleCommands.length - 1, current + 1),
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveCommandIndex((current) => Math.max(0, current - 1));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runCommand(activeCommandIndex);
                  }
                }}
              />
              <span className="rounded-full border border-[var(--paper-border)] px-2 py-1 text-xs text-[var(--paper-muted)]">
                Ctrl/Cmd+K
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {mode === "commands" && hasWorkspaceCommands ? (
                <>
                  {!deferredQuery ? (
                    <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-4 py-4 text-sm text-[var(--paper-muted)]">
                      Type to filter commands, then press Enter to run.
                    </div>
                  ) : null}

                  {commandErrorMessage ? (
                    <div className="rounded-[22px] border border-[rgba(145,47,47,0.2)] bg-[rgba(145,47,47,0.08)] px-4 py-4 text-sm text-[var(--paper-danger)]">
                      {commandErrorMessage}
                    </div>
                  ) : null}

                  {visibleCommands.length === 0 ? (
                    <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-4 py-4 text-sm text-[var(--paper-muted)]">
                      No commands match <span className="font-semibold">{deferredQuery}</span>.
                    </div>
                  ) : (
                    visibleCommands.map((command, index) => (
                      <button
                        key={command.id}
                        type="button"
                        className={cn(
                          "rounded-[22px] border px-4 py-4 text-left transition",
                          index === activeCommandIndex
                            ? "border-[var(--paper-accent)] bg-[rgba(214,173,123,0.24)]"
                            : "border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] hover:-translate-y-0.5 hover:bg-[rgba(255,255,255,0.84)]",
                          command.disabledReason && "opacity-60",
                        )}
                        onClick={() => void runCommand(index)}
                        disabled={Boolean(command.disabledReason) || pendingCommandId !== null}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--paper-muted)]">
                          <span>{command.kind}</span>
                          <span>{command.context}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-4">
                          <p className="text-base font-semibold text-[var(--paper-ink)]">
                            {command.label}
                          </p>
                          {pendingCommandId === command.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin text-[var(--paper-accent)]" />
                          ) : null}
                        </div>
                        {command.disabledReason ? (
                          <p className="mt-2 text-xs text-[var(--paper-muted)]">
                            {command.disabledReason}
                          </p>
                        ) : null}
                      </button>
                    ))
                  )}
                </>
              ) : (
                <>
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

                  {scope === "public" && deferredQuery ? (
                    <div className="flex justify-end">
                      <Link
                        href={`/search?q=${encodeURIComponent(deferredQuery)}`}
                        className="paper-button paper-button-secondary"
                      >
                        Open full results
                      </Link>
                    </div>
                  ) : null}
                </>
              )}
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
      {chapterMoveRequest && moveTargetBook ? (
        <ChapterMoveDialog
          bookSlug={chapterMoveRequest.bookSlug}
          chapterTitle={chapterMoveRequest.chapterTitle}
          chapterPath={chapterMoveRequest.chapterPath}
          bookChapters={moveTargetBook.chapters}
          initialParentPath={chapterMoveRequest.chapterPath.slice(0, -1)}
          busy={isChapterMovePending}
          errorMessage={chapterMoveError}
          onClose={() => setChapterMoveRequest(null)}
          onSubmit={(input) => {
            setChapterMoveError(null);
            setIsChapterMovePending(true);
            void workspaceActions
              .moveChapter(
                chapterMoveRequest.bookSlug,
                chapterMoveRequest.chapterPath,
                input.parentChapterPath,
                input.order,
              )
              .then(() => setChapterMoveRequest(null))
              .catch((error) => {
                setChapterMoveError(
                  error instanceof Error ? error.message : "Unable to move this chapter.",
                );
              })
              .finally(() => setIsChapterMovePending(false));
          }}
        />
      ) : null}
    </>
  );
}

