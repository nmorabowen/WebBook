"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ContentTree } from "@/lib/content/schemas";
import {
  findChapterSiblings,
  moveSlugByStep,
  moveSlugToPosition,
} from "@/components/workspace/tree-utils";

type ErrorPayload = {
  error?: string;
};

async function requestJson<T>(
  endpoint: string,
  init: RequestInit,
  fallbackMessage: string,
) {
  const response = await fetch(endpoint, init);
  const payload = (await response.json().catch(() => null)) as ErrorPayload | T | null;

  if (!response.ok) {
    throw new Error((payload as ErrorPayload | null)?.error ?? fallbackMessage);
  }

  return payload as T;
}

function chapterRoute(bookSlug: string, chapterPath: string[]) {
  return `/app/books/${bookSlug}/chapters/${chapterPath.join("/")}`;
}

function nextChapterOrder(
  tree: Pick<ContentTree, "books">,
  bookSlug: string,
  parentChapterPath: string[],
) {
  const book = tree.books.find((entry) => entry.meta.slug === bookSlug);
  if (!book) {
    return 1;
  }

  const siblings = findChapterSiblings(book.chapters, parentChapterPath);
  return (siblings?.length ?? 0) + 1;
}

export function useWorkspaceTreeActions(currentPath?: string) {
  const router = useRouter();

  const reorderBooks = useCallback(
    async (bookSlugs: string[]) => {
      await requestJson<{ books: ContentTree["books"] }>(
        "/api/books/reorder",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ bookSlugs }),
        },
        "Book reorder failed",
      );
      router.refresh();
    },
    [router],
  );

  const reorderNotes = useCallback(
    async (noteSlugs: string[]) => {
      await requestJson<{ notes: ContentTree["notes"] }>(
        "/api/notes/reorder",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ noteSlugs }),
        },
        "Note reorder failed",
      );
      router.refresh();
    },
    [router],
  );

  const moveBookByStep = useCallback(
    async (
      tree: Pick<ContentTree, "books">,
      slug: string,
      direction: "up" | "down",
    ) => {
      const orderedSlugs = tree.books.map((book) => book.meta.slug);
      const nextSlugs = moveSlugByStep(orderedSlugs, slug, direction);
      if (!nextSlugs) {
        return { changed: false };
      }
      await reorderBooks(nextSlugs);
      return { changed: true };
    },
    [reorderBooks],
  );

  const moveNoteByStep = useCallback(
    async (
      tree: Pick<ContentTree, "notes">,
      slug: string,
      direction: "up" | "down",
    ) => {
      const orderedSlugs = tree.notes.map((note) => note.meta.slug);
      const nextSlugs = moveSlugByStep(orderedSlugs, slug, direction);
      if (!nextSlugs) {
        return { changed: false };
      }
      await reorderNotes(nextSlugs);
      return { changed: true };
    },
    [reorderNotes],
  );

  const moveBookToPosition = useCallback(
    async (
      tree: Pick<ContentTree, "books">,
      slug: string,
      position: number,
    ) => {
      const orderedSlugs = tree.books.map((book) => book.meta.slug);
      const nextSlugs = moveSlugToPosition(orderedSlugs, slug, position);
      if (!nextSlugs) {
        return { changed: false };
      }
      await reorderBooks(nextSlugs);
      return { changed: true };
    },
    [reorderBooks],
  );

  const moveNoteToPosition = useCallback(
    async (
      tree: Pick<ContentTree, "notes">,
      slug: string,
      position: number,
    ) => {
      const orderedSlugs = tree.notes.map((note) => note.meta.slug);
      const nextSlugs = moveSlugToPosition(orderedSlugs, slug, position);
      if (!nextSlugs) {
        return { changed: false };
      }
      await reorderNotes(nextSlugs);
      return { changed: true };
    },
    [reorderNotes],
  );

  const moveChapter = useCallback(
    async (
      bookSlug: string,
      chapterPath: string[],
      destinationBookSlug: string,
      parentChapterPath: string[],
      order?: number,
    ) => {
      const payload = await requestJson<{ path?: string[]; meta?: { bookSlug?: string } }>(
        `/api/books/${bookSlug}/chapters/move`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chapterPath,
            destinationBookSlug,
            parentChapterPath,
            order,
          }),
        },
        "Unable to move chapter.",
      );

      if (payload?.path?.length) {
        router.push(chapterRoute(payload.meta?.bookSlug ?? destinationBookSlug, payload.path));
      }
      router.refresh();

      return payload;
    },
    [router],
  );

  const moveChapterByStep = useCallback(
    async (
      tree: Pick<ContentTree, "books">,
      bookSlug: string,
      chapterPath: string[],
      direction: "up" | "down",
    ) => {
      const book = tree.books.find((entry) => entry.meta.slug === bookSlug);
      if (!book) {
        return { changed: false };
      }

      const parentChapterPath = chapterPath.slice(0, -1);
      const siblings = findChapterSiblings(book.chapters, parentChapterPath);
      const chapterSlug = chapterPath.at(-1);
      if (!siblings || !chapterSlug) {
        return { changed: false };
      }

      const index = siblings.findIndex((chapter) => chapter.meta.slug === chapterSlug);
      if (index < 0) {
        return { changed: false };
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= siblings.length) {
        return { changed: false };
      }

      const payload = await moveChapter(
        bookSlug,
        chapterPath,
        bookSlug,
        parentChapterPath,
        targetIndex + 1,
      );
      return {
        changed: true,
        path: payload.path,
      };
    },
    [moveChapter],
  );

  const createBook = useCallback(
    async (title: string) => {
      const payload = await requestJson<{ meta?: { slug: string } }>(
        "/api/books",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            slug: title,
            description: "A fresh WebBook.",
            body: "# New book\n\nOutline the idea here.",
            status: "draft",
          }),
        },
        "Could not create book.",
      );

      if (payload.meta?.slug) {
        router.push(`/app/books/${payload.meta.slug}`);
      }
      router.refresh();
      return payload;
    },
    [router],
  );

  const createNote = useCallback(
    async (title: string) => {
      const payload = await requestJson<{ meta?: { slug: string } }>(
        "/api/notes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            slug: title,
            summary: "A fresh standalone note.",
            body: "# New note\n\nStart writing here.",
            status: "draft",
            typography: {
              bodyFontSize: 1,
              bodyLineHeight: 1,
              headingBaseSize: 2.5,
              headingScale: 1.25,
              headingIndentStep: 0,
              paragraphSpacing: 1,
              contentWidth: 75,
            },
          }),
        },
        "Could not create note.",
      );

      if (payload.meta?.slug) {
        router.push(`/app/notes/${payload.meta.slug}`);
      }
      router.refresh();
      return payload;
    },
    [router],
  );

  const createChapter = useCallback(
    async (
      tree: Pick<ContentTree, "books">,
      bookSlug: string,
      title: string,
      parentChapterPath: string[],
      order?: number,
    ) => {
      const payload = await requestJson<{ meta?: { slug: string }; path?: string[] }>(
        `/api/books/${bookSlug}/chapters`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            slug: title,
            parentChapterPath,
            summary: "A fresh chapter.",
            body: "# New chapter\n\nStart writing here.",
            status: "draft",
            order: order ?? nextChapterOrder(tree, bookSlug, parentChapterPath),
          }),
        },
        "Could not create chapter.",
      );

      const createdPath =
        payload.path && payload.path.length
          ? payload.path
          : payload.meta?.slug
            ? [...parentChapterPath, payload.meta.slug]
            : null;
      if (createdPath) {
        router.push(chapterRoute(bookSlug, createdPath));
      }
      router.refresh();
      return payload;
    },
    [router],
  );

  const duplicateBook = useCallback(
    async (slug: string) => {
      const payload = await requestJson<{ meta?: { slug: string } }>(
        `/api/books/${slug}/duplicate`,
        {
          method: "POST",
        },
        "Unable to duplicate this book.",
      );
      if (payload.meta?.slug) {
        router.push(`/app/books/${payload.meta.slug}`);
      }
      router.refresh();
      return payload;
    },
    [router],
  );

  const duplicateNote = useCallback(
    async (slug: string) => {
      const payload = await requestJson<{ meta?: { slug: string } }>(
        `/api/notes/${slug}/duplicate`,
        {
          method: "POST",
        },
        "Unable to duplicate this note.",
      );
      if (payload.meta?.slug) {
        router.push(`/app/notes/${payload.meta.slug}`);
      }
      router.refresh();
      return payload;
    },
    [router],
  );

  const moveNoteToBook = useCallback(
    async (
      slug: string,
      destinationBookSlug: string,
      parentChapterPath: string[],
      order?: number,
    ) => {
      const payload = await requestJson<{
        meta?: { slug: string; bookSlug?: string };
        path?: string[];
      }>(
        `/api/notes/${slug}/move`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            destinationBookSlug,
            parentChapterPath,
            order,
          }),
        },
        "Unable to move this note into a book.",
      );

      if (payload.path?.length) {
        router.push(chapterRoute(payload.meta?.bookSlug ?? destinationBookSlug, payload.path));
      }
      router.refresh();
      return payload;
    },
    [router],
  );

  const duplicateChapter = useCallback(
    async (bookSlug: string, chapterPath: string[]) => {
      const payload = await requestJson<{ meta?: { slug: string }; path?: string[] }>(
        `/api/books/${bookSlug}/chapters/duplicate/${chapterPath.join("/")}`,
        {
          method: "POST",
        },
        "Unable to duplicate this chapter.",
      );
      const nextPath =
        payload.path && payload.path.length
          ? payload.path
          : payload.meta?.slug
            ? [...chapterPath.slice(0, -1), payload.meta.slug]
            : null;
      if (nextPath) {
        router.push(chapterRoute(bookSlug, nextPath));
      }
      router.refresh();
      return payload;
    },
    [router],
  );

  const deleteBook = useCallback(
    async (slug: string) => {
      await requestJson<{ ok: true }>(
        `/api/books/${slug}`,
        {
          method: "DELETE",
        },
        "Unable to delete this book.",
      );
      if (currentPath?.startsWith(`/app/books/${slug}`)) {
        router.push("/app");
      }
      router.refresh();
    },
    [currentPath, router],
  );

  const deleteNote = useCallback(
    async (slug: string) => {
      await requestJson<{ ok: true }>(
        `/api/notes/${slug}`,
        {
          method: "DELETE",
        },
        "Unable to delete this note.",
      );
      if (currentPath === `/app/notes/${slug}`) {
        router.push("/app");
      }
      router.refresh();
    },
    [currentPath, router],
  );

  const deleteChapter = useCallback(
    async (bookSlug: string, chapterPath: string[]) => {
      await requestJson<{ ok: true }>(
        `/api/books/${bookSlug}/chapters/${chapterPath.join("/")}`,
        {
          method: "DELETE",
        },
        "Unable to delete this chapter.",
      );

      if (currentPath === chapterRoute(bookSlug, chapterPath)) {
        router.push(`/app/books/${bookSlug}`);
      }
      router.refresh();
    },
    [currentPath, router],
  );

  return {
    reorderBooks,
    reorderNotes,
    moveBookByStep,
    moveNoteByStep,
    moveBookToPosition,
    moveNoteToPosition,
    moveChapter,
    moveChapterByStep,
    createBook,
    createNote,
    createChapter,
    duplicateBook,
    duplicateNote,
    moveNoteToBook,
    duplicateChapter,
    deleteBook,
    deleteNote,
    deleteChapter,
  };
}

