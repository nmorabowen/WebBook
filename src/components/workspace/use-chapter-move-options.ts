"use client";

import { useMemo } from "react";
import type { ChapterTreeNode } from "@/lib/content/schemas";
import { chapterPathStartsWith } from "@/components/workspace/tree-utils";

export type MoveDestinationOption = {
  key: string;
  parentPath: string[];
  label: string;
  subtitle: string;
  depth: number;
  search: string;
};

const RECENT_DESTINATION_LIMIT = 8;

function destinationStorageKey(bookSlug: string) {
  return `webbook.chapter-move.recent.${bookSlug}`;
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

export function buildChapterMoveDestinationOptions(
  bookChapters: ChapterTreeNode[],
  chapterPath: string[],
) {
  const rootOption: MoveDestinationOption = {
    key: "",
    parentPath: [],
    label: "Book root",
    subtitle: "/",
    depth: 0,
    search: "book root /",
  };

  return [rootOption, ...flattenMoveDestinationOptions(bookChapters, chapterPath)];
}

export function loadRecentDestinationPaths(bookSlug: string) {
  if (typeof window === "undefined") {
    return [] as string[][];
  }

  try {
    const raw = window.localStorage.getItem(destinationStorageKey(bookSlug));
    if (!raw) {
      return [] as string[][];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as string[][];
    }

    return parsed
      .filter((entry): entry is string[] => Array.isArray(entry))
      .map((entry) => entry.filter((segment): segment is string => typeof segment === "string"))
      .filter((entry) => entry.every((segment) => segment.length > 0));
  } catch {
    return [] as string[][];
  }
}

export function saveRecentDestinationPath(bookSlug: string, parentPath: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const current = loadRecentDestinationPaths(bookSlug).filter(
      (entry) =>
        entry.length !== parentPath.length ||
        entry.some((segment, index) => segment !== parentPath[index]),
    );
    const next = [parentPath, ...current].slice(0, RECENT_DESTINATION_LIMIT);
    window.localStorage.setItem(destinationStorageKey(bookSlug), JSON.stringify(next));
  } catch {}
}

export function useChapterMoveOptions(
  bookSlug: string,
  bookChapters: ChapterTreeNode[],
  chapterPath: string[],
) {
  const options = useMemo(
    () => buildChapterMoveDestinationOptions(bookChapters, chapterPath),
    [bookChapters, chapterPath],
  );

  const recentOptions = useMemo(() => {
    const recentPaths = loadRecentDestinationPaths(bookSlug);
    const optionMap = new Map(options.map((option) => [option.key, option] as const));
    return recentPaths
      .map((path) => optionMap.get(path.join("/")) ?? null)
      .filter((option): option is MoveDestinationOption => option !== null);
  }, [bookSlug, options]);

  return {
    options,
    recentOptions,
  };
}
