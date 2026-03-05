"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { ChapterTreeNode } from "@/lib/content/schemas";
import { cn } from "@/lib/utils";

type MoveDestinationOption = {
  key: string;
  parentPath: string[];
  label: string;
  subtitle: string;
  depth: number;
  search: string;
};

function chapterPathEquals(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function chapterPathStartsWith(pathValue: string[], prefix: string[]) {
  return (
    prefix.length <= pathValue.length &&
    prefix.every((segment, index) => pathValue[index] === segment)
  );
}

function flattenMoveDestinationOptions(
  chapters: ChapterTreeNode[],
  excludedPath: string[],
  parentPath: string[] = [],
): MoveDestinationOption[] {
  const options: MoveDestinationOption[] = [];

  for (const chapter of chapters) {
    const nextPath = [...parentPath, chapter.meta.slug];
    if (chapterPathStartsWith(nextPath, excludedPath)) {
      continue;
    }

    options.push({
      key: nextPath.join("/"),
      parentPath: nextPath,
      label: chapter.meta.title,
      subtitle: nextPath.join("/"),
      depth: nextPath.length,
      search: `${chapter.meta.title} ${nextPath.join(" ")}`.toLowerCase(),
    });

    options.push(
      ...flattenMoveDestinationOptions(chapter.children, excludedPath, nextPath),
    );
  }

  return options;
}

export function ChapterMoveDialog({
  chapterTitle,
  chapterPath,
  bookChapters,
  initialParentPath,
  busy,
  errorMessage,
  onClose,
  onSubmit,
}: {
  chapterTitle: string;
  chapterPath: string[];
  bookChapters: ChapterTreeNode[];
  initialParentPath: string[];
  busy: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (input: { parentChapterPath: string[]; order?: number }) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParentPath, setSelectedParentPath] = useState<string[]>(initialParentPath);
  const [orderValue, setOrderValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const currentParentPath = chapterPath.slice(0, -1);

  const moveDestinationOptions = useMemo(() => {
    const rootOption: MoveDestinationOption = {
      key: "",
      parentPath: [],
      label: "Book root",
      subtitle: "/",
      depth: 0,
      search: "book root /",
    };

    return [
      rootOption,
      ...flattenMoveDestinationOptions(bookChapters, chapterPath),
    ];
  }, [bookChapters, chapterPath]);

  const filteredMoveDestinations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return moveDestinationOptions;
    }

    return moveDestinationOptions.filter(
      (option) => option.search.includes(query) || option.subtitle.includes(query),
    );
  }, [moveDestinationOptions, searchQuery]);

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

    return findSiblings(bookChapters, selectedParentPath)?.length ?? 0;
  }, [bookChapters, selectedParentPath]);

  const sameParentSelection = chapterPathEquals(selectedParentPath, currentParentPath);
  const maxDestinationOrder = sameParentSelection
    ? Math.max(1, destinationSiblingCount)
    : destinationSiblingCount + 1;
  const isNoopSelection = sameParentSelection && orderValue.trim().length === 0;
  const selectedParentDisplay = selectedParentPath.length
    ? `/${selectedParentPath.join("/")}`
    : "/";

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
                if (event.key !== "Enter") {
                  return;
                }
                event.preventDefault();
                const firstOption = filteredMoveDestinations[0];
                if (firstOption) {
                  setSelectedParentPath(firstOption.parentPath);
                }
              }}
            />
          </div>
          <p className="text-xs text-[var(--paper-muted)]">
            Selected destination: {selectedParentDisplay}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-2">
            {filteredMoveDestinations.length ? (
              <div className="grid gap-1">
                {filteredMoveDestinations.map((option) => {
                  const selected = chapterPathEquals(
                    option.parentPath,
                    selectedParentPath,
                  );
                  return (
                    <button
                      key={option.key || "book-root"}
                      type="button"
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition",
                        selected
                          ? "bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]"
                          : "hover:bg-[rgba(132,99,63,0.12)]",
                      )}
                      style={{ paddingLeft: `${12 + option.depth * 12}px` }}
                      onClick={() => setSelectedParentPath(option.parentPath)}
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
              onSubmit({
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
