"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { ChapterTreeNode, ContentTree } from "@/lib/content/schemas";
import {
  buildChapterMoveDestinationOptions,
  loadRecentDestinationPaths,
  saveRecentDestinationPath,
} from "@/components/workspace/use-chapter-move-options";
import { chapterPathsEqual } from "@/components/workspace/tree-utils";
import { cn } from "@/lib/utils";

export function ChapterMoveDialog({
  bookSlug,
  chapterTitle,
  chapterPath,
  books,
  initialParentPath,
  busy,
  errorMessage,
  onClose,
  onSubmit,
}: {
  bookSlug: string;
  chapterTitle: string;
  chapterPath: string[];
  books: Pick<ContentTree, "books">["books"];
  initialParentPath: string[];
  busy: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (input: {
    destinationBookSlug: string;
    parentChapterPath: string[];
    order?: number;
  }) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBookSlug, setSelectedBookSlug] = useState(bookSlug);
  const [selectedParentPath, setSelectedParentPath] = useState<string[]>(initialParentPath);
  const [orderValue, setOrderValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const currentParentPath = chapterPath.slice(0, -1);
  const selectedBook =
    books.find((book) => book.meta.slug === selectedBookSlug) ??
    books.find((book) => book.meta.slug === bookSlug) ??
    null;
  const moveDestinationOptions = useMemo(
    () =>
      selectedBook
        ? buildChapterMoveDestinationOptions(
            selectedBook.chapters,
            selectedBookSlug === bookSlug ? chapterPath : [],
          )
        : [],
    [bookSlug, chapterPath, selectedBook, selectedBookSlug],
  );
  const recentOptions = useMemo(() => {
    if (!selectedBook) {
      return [];
    }
    const recentPaths = loadRecentDestinationPaths(selectedBook.meta.slug);
    const optionMap = new Map(moveDestinationOptions.map((option) => [option.key, option] as const));
    return recentPaths
      .map((path) => optionMap.get(path.join("/")) ?? null)
      .filter((option): option is (typeof moveDestinationOptions)[number] => option !== null);
  }, [moveDestinationOptions, selectedBook]);

  useEffect(() => {
    setSelectedParentPath(selectedBookSlug === bookSlug ? initialParentPath : []);
    setSearchQuery("");
    setOrderValue("");
  }, [bookSlug, initialParentPath, selectedBookSlug]);

  const filteredMoveDestinations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return moveDestinationOptions;
    }

    return moveDestinationOptions.filter(
      (option) => option.search.includes(query) || option.subtitle.includes(query),
    );
  }, [moveDestinationOptions, searchQuery]);

  useEffect(() => {
    if (!filteredMoveDestinations.length) {
      setActiveOptionIndex(0);
      return;
    }

    setActiveOptionIndex((current) =>
      Math.max(0, Math.min(filteredMoveDestinations.length - 1, current)),
    );
  }, [filteredMoveDestinations]);

  useEffect(() => {
    setLocalError(null);
  }, [orderValue, searchQuery, selectedParentPath]);

  const destinationSiblingCount = useMemo(() => {
    const findSiblings = (
      chapters: ChapterTreeNode[],
      parentPath: string[],
    ): ChapterTreeNode[] | null => {
      if (!parentPath.length) {
        return chapters;
      }

      const [head, ...tail] = parentPath;
      const parent = chapters.find((chapter) => chapter.meta.slug === head);
      if (!parent) {
        return null;
      }
      return findSiblings(parent.children, tail);
    };

    return findSiblings(selectedBook?.chapters ?? [], selectedParentPath)?.length ?? 0;
  }, [selectedBook, selectedParentPath]);

  const sameParentSelection =
    selectedBookSlug === bookSlug && chapterPathsEqual(selectedParentPath, currentParentPath);
  const maxDestinationOrder = sameParentSelection
    ? Math.max(1, destinationSiblingCount)
    : destinationSiblingCount + 1;
  const isNoopSelection = sameParentSelection && orderValue.trim().length === 0;
  const selectedParentDisplay = selectedParentPath.length
    ? `${selectedBookSlug}:/${selectedParentPath.join("/")}`
    : `${selectedBookSlug}:/`;
  const selectedOrderDisplay = orderValue.trim() || "append";

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(20,15,12,0.38)] p-4">
      <div className="w-full max-w-2xl rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.98)] p-5 shadow-[0_25px_70px_rgba(27,17,8,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="paper-label">Move chapter</p>
            <h2 className="font-serif text-2xl leading-tight">{chapterTitle}</h2>
          </div>
          <button
            type="button"
            className="icon-plain-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close move dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <label className="paper-label" htmlFor="chapter-move-book">
            Destination book
          </label>
          <select
            id="chapter-move-book"
            className="paper-select"
            value={selectedBookSlug}
            onChange={(event) => setSelectedBookSlug(event.target.value)}
          >
            {books.map((book) => (
              <option key={book.meta.slug} value={book.meta.slug}>
                {book.meta.title}
              </option>
            ))}
          </select>
          <label className="paper-label" htmlFor="chapter-move-search">
            Destination parent
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-muted)]" />
            <input
              id="chapter-move-search"
              className="paper-input pl-9"
              placeholder="Search by title or path"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveOptionIndex((current) =>
                    Math.min(filteredMoveDestinations.length - 1, current + 1),
                  );
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveOptionIndex((current) => Math.max(0, current - 1));
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const activeOption = filteredMoveDestinations[activeOptionIndex];
                  if (activeOption) {
                    setSelectedParentPath(activeOption.parentPath);
                  }
                }
              }}
            />
          </div>
          <div className="rounded-[14px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.68)] px-3 py-2 text-xs text-[var(--paper-muted)]">
            <p>
              Selected destination: <span className="font-semibold">{selectedParentDisplay}</span>
            </p>
            <p>
              Destination order: <span className="font-semibold">{selectedOrderDisplay}</span>
            </p>
          </div>
          {recentOptions.length ? (
            <div className="grid gap-1">
              <p className="paper-label">Recent destinations</p>
              <div className="flex flex-wrap gap-2">
                {recentOptions.map((option) => (
                  <button
                    key={`recent-${option.key || "book-root"}`}
                    type="button"
                    className="paper-button paper-button-secondary px-3 py-1.5 text-xs"
                    onClick={() => setSelectedParentPath(option.parentPath)}
                  >
                    {option.subtitle}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="max-h-64 overflow-y-auto rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-2">
            {filteredMoveDestinations.length ? (
              <div className="grid gap-1">
                {filteredMoveDestinations.map((option, optionIndex) => {
                  const selected = chapterPathsEqual(option.parentPath, selectedParentPath);
                  const highlighted = optionIndex === activeOptionIndex;
                  return (
                    <button
                      key={option.key || "book-root"}
                      type="button"
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition",
                        selected
                          ? "bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]"
                          : highlighted
                            ? "bg-[rgba(132,99,63,0.14)]"
                          : "hover:bg-[rgba(132,99,63,0.12)]",
                      )}
                      style={{ paddingLeft: `${12 + option.depth * 12}px` }}
                      onClick={() => {
                        setSelectedParentPath(option.parentPath);
                        setActiveOptionIndex(optionIndex);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="block truncate text-xs text-[var(--paper-muted)]">
                          {option.subtitle}
                        </span>
                      </span>
                      {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-2 py-1 text-sm text-[var(--paper-muted)]">
                No destinations match your search.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <label className="paper-label" htmlFor="chapter-move-order">
            Destination order (optional)
          </label>
          <input
            id="chapter-move-order"
            className="paper-input"
            inputMode="numeric"
            placeholder={`Append at end (max ${maxDestinationOrder})`}
            value={orderValue}
            onChange={(event) => setOrderValue(event.target.value)}
          />
          {localError ? (
            <p className="text-sm text-[var(--paper-danger)]" role="alert">
              {localError}
            </p>
          ) : null}
          {!localError && errorMessage ? (
            <p className="text-sm text-[var(--paper-danger)]" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {!localError && !errorMessage && isNoopSelection ? (
            <p className="text-sm text-[var(--paper-muted)]" role="status">
              Select a different destination or set an order to reorder within the same parent.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="paper-button paper-button-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="paper-button"
            onClick={() => {
              const rawOrder = orderValue.trim();
              let order: number | undefined;
              if (rawOrder.length) {
                const parsed = Number.parseInt(rawOrder, 10);
                if (!Number.isFinite(parsed) || parsed < 1) {
                  setLocalError("Destination order must be a positive integer.");
                  return;
                }
                if (parsed > maxDestinationOrder) {
                  setLocalError(
                    `Destination order must be between 1 and ${maxDestinationOrder}.`,
                  );
                  return;
                }
                order = parsed;
              }
              if (sameParentSelection && order === undefined) {
              setLocalError(
                "No move selected. Pick another destination or enter an order.",
              );
              return;
            }
            setLocalError(null);
            saveRecentDestinationPath(selectedBookSlug, selectedParentPath);
            onSubmit({
              destinationBookSlug: selectedBookSlug,
              parentChapterPath: selectedParentPath,
              order,
            });
            }}
            disabled={busy || isNoopSelection}
          >
            {busy ? "Moving..." : "Move chapter"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
