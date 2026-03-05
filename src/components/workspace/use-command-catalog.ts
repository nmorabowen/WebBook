"use client";

import { useMemo } from "react";
import { buildChapterNumberIndex } from "@/lib/chapter-numbering";
import type { ContentTree } from "@/lib/content/schemas";
import {
  chapterPathsEqual,
  flattenBookChapterRefs,
  parseWorkspaceRoute,
} from "@/components/workspace/tree-utils";
import type {
  WorkspaceChapterMoveRequest,
  WorkspaceCommand,
} from "@/components/workspace/types";

type CommandActions = {
  moveBookByStep: (
    tree: Pick<ContentTree, "books">,
    slug: string,
    direction: "up" | "down",
  ) => Promise<{ changed: boolean }>;
  moveNoteByStep: (
    tree: Pick<ContentTree, "notes">,
    slug: string,
    direction: "up" | "down",
  ) => Promise<{ changed: boolean }>;
  moveChapterByStep: (
    tree: Pick<ContentTree, "books">,
    bookSlug: string,
    chapterPath: string[],
    direction: "up" | "down",
  ) => Promise<{ changed: boolean; path?: string[] }>;
};

type UseCommandCatalogInput = {
  tree: Pick<ContentTree, "books" | "notes">;
  currentPath?: string;
  actions: CommandActions;
  onOpenChapterMove: (request: WorkspaceChapterMoveRequest) => void;
};

export function buildWorkspaceCommandCatalog({
  tree,
  currentPath,
  actions,
  onOpenChapterMove,
}: UseCommandCatalogInput) {
  const currentContext = parseWorkspaceRoute(currentPath);
  const commands: Array<WorkspaceCommand & { activeWeight: number }> = [];

  for (const [bookIndex, book] of tree.books.entries()) {
    const canMoveUp = bookIndex > 0;
    const canMoveDown = bookIndex < tree.books.length - 1;
    const isCurrentBook =
      currentContext?.kind === "book" && currentContext.slug === book.meta.slug;

    commands.push({
      id: `book:${book.meta.slug}:up`,
      label: `Move book up: ${book.meta.title}`,
      kind: "book",
      context: "Books",
      keywords: `book move up ${book.meta.title} ${book.meta.slug}`.toLowerCase(),
      disabledReason: canMoveUp ? undefined : "Already first book",
      run: () => actions.moveBookByStep(tree, book.meta.slug, "up"),
      activeWeight: isCurrentBook ? 2 : 0,
    });
    commands.push({
      id: `book:${book.meta.slug}:down`,
      label: `Move book down: ${book.meta.title}`,
      kind: "book",
      context: "Books",
      keywords: `book move down ${book.meta.title} ${book.meta.slug}`.toLowerCase(),
      disabledReason: canMoveDown ? undefined : "Already last book",
      run: () => actions.moveBookByStep(tree, book.meta.slug, "down"),
      activeWeight: isCurrentBook ? 2 : 0,
    });

    const chapterRefs = flattenBookChapterRefs(book.meta.slug, book.chapters);
    const chapterNumbers = buildChapterNumberIndex(book.chapters);

    for (const chapterRef of chapterRefs) {
      const chapterPathKey = chapterRef.path.join("/");
      const chapterNumber = chapterNumbers.get(chapterPathKey) ?? "";
      const displayChapter = chapterNumber
        ? `${chapterNumber} ${chapterRef.title}`
        : chapterRef.title;
      const isCurrentChapter =
        currentContext?.kind === "chapter" &&
        currentContext.bookSlug === chapterRef.bookSlug &&
        chapterPathsEqual(currentContext.chapterPath, chapterRef.path);
      const canMoveUp = chapterRef.siblingIndex > 0;
      const canMoveDown = chapterRef.siblingIndex < chapterRef.siblingCount - 1;

      commands.push({
        id: `chapter:${chapterRef.bookSlug}:${chapterPathKey}:up`,
        label: `Move chapter up: ${displayChapter}`,
        kind: "chapter",
        context: book.meta.title,
        keywords:
          `chapter move up ${chapterRef.title} ${chapterPathKey} ${book.meta.title}`.toLowerCase(),
        disabledReason: canMoveUp ? undefined : "Already first sibling",
        run: () =>
          actions.moveChapterByStep(
            tree,
            chapterRef.bookSlug,
            chapterRef.path,
            "up",
          ),
        activeWeight: isCurrentChapter ? 3 : 0,
      });
      commands.push({
        id: `chapter:${chapterRef.bookSlug}:${chapterPathKey}:down`,
        label: `Move chapter down: ${displayChapter}`,
        kind: "chapter",
        context: book.meta.title,
        keywords:
          `chapter move down ${chapterRef.title} ${chapterPathKey} ${book.meta.title}`.toLowerCase(),
        disabledReason: canMoveDown ? undefined : "Already last sibling",
        run: () =>
          actions.moveChapterByStep(
            tree,
            chapterRef.bookSlug,
            chapterRef.path,
            "down",
          ),
        activeWeight: isCurrentChapter ? 3 : 0,
      });
      commands.push({
        id: `chapter:${chapterRef.bookSlug}:${chapterPathKey}:move`,
        label: `Move chapter to... ${displayChapter}`,
        kind: "chapter",
        context: book.meta.title,
        keywords:
          `chapter move destination ${chapterRef.title} ${chapterPathKey} ${book.meta.title}`.toLowerCase(),
        run: () =>
          onOpenChapterMove({
            bookSlug: chapterRef.bookSlug,
            chapterPath: chapterRef.path,
            chapterTitle: chapterRef.title,
          }),
        activeWeight: isCurrentChapter ? 3 : 0,
      });
    }
  }

  for (const [noteIndex, note] of tree.notes.entries()) {
    const canMoveUp = noteIndex > 0;
    const canMoveDown = noteIndex < tree.notes.length - 1;
    const isCurrentNote =
      currentContext?.kind === "note" && currentContext.slug === note.meta.slug;
    commands.push({
      id: `note:${note.meta.slug}:up`,
      label: `Move note up: ${note.meta.title}`,
      kind: "note",
      context: "Notes",
      keywords: `note move up ${note.meta.title} ${note.meta.slug}`.toLowerCase(),
      disabledReason: canMoveUp ? undefined : "Already first note",
      run: () => actions.moveNoteByStep(tree, note.meta.slug, "up"),
      activeWeight: isCurrentNote ? 2 : 0,
    });
    commands.push({
      id: `note:${note.meta.slug}:down`,
      label: `Move note down: ${note.meta.title}`,
      kind: "note",
      context: "Notes",
      keywords: `note move down ${note.meta.title} ${note.meta.slug}`.toLowerCase(),
      disabledReason: canMoveDown ? undefined : "Already last note",
      run: () => actions.moveNoteByStep(tree, note.meta.slug, "down"),
      activeWeight: isCurrentNote ? 2 : 0,
    });
  }

  return commands
    .sort((left, right) => {
      if (left.activeWeight !== right.activeWeight) {
        return right.activeWeight - left.activeWeight;
      }
      return left.label.localeCompare(right.label);
    })
    .map(({ activeWeight: _activeWeight, ...command }) => command);
}

export function useCommandCatalog({
  tree,
  currentPath,
  actions,
  onOpenChapterMove,
}: UseCommandCatalogInput) {
  return useMemo(
    () => buildWorkspaceCommandCatalog({ tree, currentPath, actions, onOpenChapterMove }),
    [actions, currentPath, onOpenChapterMove, tree],
  );
}
