import type { ChapterTreeNode, ContentTree } from "@/lib/content/schemas";

export type NodeRef =
  | { kind: "book"; slug: string }
  | { kind: "chapter"; bookSlug: string; chapterPath: string[] }
  | { kind: "note"; slug: string }
  | { kind: "notes-root" };

export type DropPosition = "before" | "after" | "inside";

export type ApiCall = {
  method: "POST";
  url: string;
  body: Record<string, unknown>;
};

export type DispatchResult = { ok: true; call: ApiCall } | { ok: false; error: string };

function sameRef(a: NodeRef, b: NodeRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "book" && b.kind === "book") return a.slug === b.slug;
  if (a.kind === "note" && b.kind === "note") return a.slug === b.slug;
  if (a.kind === "chapter" && b.kind === "chapter") {
    return a.bookSlug === b.bookSlug && a.chapterPath.join("/") === b.chapterPath.join("/");
  }
  return a.kind === b.kind;
}

function isDescendantChapterPath(parent: string[], candidate: string[]): boolean {
  if (candidate.length <= parent.length) return false;
  return parent.every((seg, i) => seg === candidate[i]);
}

function findChapter(
  chapters: ChapterTreeNode[],
  path: string[],
): ChapterTreeNode | null {
  if (path.length === 0) return null;
  const [head, ...tail] = path;
  const node = chapters.find((c) => c.meta.slug === head);
  if (!node) return null;
  if (tail.length === 0) return node;
  return findChapter(node.children, tail);
}

function findBook(tree: ContentTree, slug: string) {
  return tree.books.find((b) => b.meta.slug === slug) ?? null;
}

function siblingChapters(
  tree: ContentTree,
  bookSlug: string,
  parentPath: string[],
): ChapterTreeNode[] | null {
  const book = findBook(tree, bookSlug);
  if (!book) return null;
  if (parentPath.length === 0) return book.chapters;
  const parent = findChapter(book.chapters, parentPath);
  return parent ? parent.children : null;
}

function orderForInsert<T>(
  siblings: T[],
  targetIndex: number,
  position: "before" | "after",
  excluded?: number,
): number {
  let index = position === "before" ? targetIndex : targetIndex + 1;
  if (excluded !== undefined && excluded < index) index -= 1;
  return Math.max(1, index + 1);
}

/**
 * Pure function that maps a drag/drop gesture to an API call (or rejection).
 *
 * @param revision current tree revision for optimistic-concurrency gating
 */
export function dispatchTreeDrop(input: {
  source: NodeRef;
  destination: NodeRef;
  position: DropPosition;
  tree: ContentTree;
  revision: string | null;
}): DispatchResult {
  const { source, destination, position, tree, revision } = input;
  const rev = revision ?? undefined;

  if (sameRef(source, destination)) {
    return { ok: false, error: "Cannot drop an item onto itself." };
  }

  // ── Book → Book ────────────────────────────────────────────────
  if (source.kind === "book" && destination.kind === "book") {
    if (position === "inside") {
      return { ok: false, error: "Books cannot be nested." };
    }
    const slugs = tree.books.map((b) => b.meta.slug);
    const fromIndex = slugs.indexOf(source.slug);
    const toIndex = slugs.indexOf(destination.slug);
    if (fromIndex < 0 || toIndex < 0) {
      return { ok: false, error: "Unknown book reference." };
    }
    const without = slugs.filter((_, i) => i !== fromIndex);
    const insertAt = orderForInsert(without, toIndex, position, fromIndex) - 1;
    const reordered = [...without.slice(0, insertAt), source.slug, ...without.slice(insertAt)];
    return {
      ok: true,
      call: {
        method: "POST",
        url: "/api/books/reorder",
        body: { bookSlugs: reordered, revision: rev },
      },
    };
  }

  // ── Note → Note ────────────────────────────────────────────────
  if (source.kind === "note" && destination.kind === "note") {
    if (position === "inside") {
      return { ok: false, error: "Notes cannot be nested." };
    }
    const slugs = tree.notes.map((n) => n.meta.slug);
    const fromIndex = slugs.indexOf(source.slug);
    const toIndex = slugs.indexOf(destination.slug);
    if (fromIndex < 0 || toIndex < 0) {
      return { ok: false, error: "Unknown note reference." };
    }
    const without = slugs.filter((_, i) => i !== fromIndex);
    const insertAt = orderForInsert(without, toIndex, position, fromIndex) - 1;
    const reordered = [...without.slice(0, insertAt), source.slug, ...without.slice(insertAt)];
    return {
      ok: true,
      call: {
        method: "POST",
        url: "/api/notes/reorder",
        body: { noteSlugs: reordered, revision: rev },
      },
    };
  }

  // ── Chapter → Notes root or Note (demote to note) ──────────────
  if (
    source.kind === "chapter" &&
    (destination.kind === "notes-root" || destination.kind === "note")
  ) {
    const destOrder =
      destination.kind === "note"
        ? (() => {
            const slugs = tree.notes.map((n) => n.meta.slug);
            const targetIndex = slugs.indexOf(destination.slug);
            if (targetIndex < 0) return undefined;
            return orderForInsert(slugs, targetIndex, position === "inside" ? "after" : position);
          })()
        : undefined;
    return {
      ok: true,
      call: {
        method: "POST",
        url: "/api/notes/from-chapter",
        body: {
          bookSlug: source.bookSlug,
          chapterPath: source.chapterPath,
          ...(destOrder !== undefined ? { order: destOrder } : {}),
          revision: rev,
        },
      },
    };
  }

  // ── Note → Book or Chapter (promote to chapter) ────────────────
  if (source.kind === "note" && (destination.kind === "book" || destination.kind === "chapter")) {
    const destBookSlug = destination.kind === "book" ? destination.slug : destination.bookSlug;
    let parentChapterPath: string[] = [];
    let order: number | undefined;

    if (destination.kind === "book") {
      parentChapterPath = [];
      if (position !== "inside") {
        return { ok: false, error: "Drop a note inside a book to promote it to a chapter." };
      }
    } else {
      const destBook = findBook(tree, destBookSlug);
      if (!destBook) return { ok: false, error: "Destination book not found." };
      if (position === "inside") {
        parentChapterPath = destination.chapterPath;
      } else {
        parentChapterPath = destination.chapterPath.slice(0, -1);
        const siblings = siblingChapters(tree, destBookSlug, parentChapterPath);
        if (!siblings) return { ok: false, error: "Destination chapter parent not found." };
        const targetIndex = siblings.findIndex(
          (c) => c.meta.slug === destination.chapterPath.at(-1),
        );
        if (targetIndex < 0) return { ok: false, error: "Destination chapter not found." };
        order = orderForInsert(siblings, targetIndex, position);
      }
    }

    return {
      ok: true,
      call: {
        method: "POST",
        url: `/api/notes/${encodeURIComponent(source.slug)}/move`,
        body: {
          destinationBookSlug: destBookSlug,
          parentChapterPath,
          ...(order !== undefined ? { order } : {}),
          revision: rev,
        },
      },
    };
  }

  // ── Chapter → Book or Chapter ──────────────────────────────────
  if (source.kind === "chapter" && (destination.kind === "book" || destination.kind === "chapter")) {
    const destBookSlug = destination.kind === "book" ? destination.slug : destination.bookSlug;

    let parentChapterPath: string[] = [];
    let order: number | undefined;

    if (destination.kind === "book") {
      if (position !== "inside") {
        return { ok: false, error: "Drop a chapter inside a book to move it." };
      }
      parentChapterPath = [];
    } else {
      // Descendant guard: same book + destination is descendant of source.
      if (
        source.bookSlug === destBookSlug &&
        isDescendantChapterPath(source.chapterPath, destination.chapterPath)
      ) {
        return { ok: false, error: "Cannot move a chapter into its own descendant." };
      }
      if (position === "inside") {
        parentChapterPath = destination.chapterPath;
      } else {
        parentChapterPath = destination.chapterPath.slice(0, -1);
        const siblings = siblingChapters(tree, destBookSlug, parentChapterPath);
        if (!siblings) return { ok: false, error: "Destination chapter parent not found." };
        const excludedIndex =
          source.bookSlug === destBookSlug &&
          source.chapterPath.slice(0, -1).join("/") === parentChapterPath.join("/")
            ? siblings.findIndex((c) => c.meta.slug === source.chapterPath.at(-1))
            : undefined;
        const targetIndex = siblings.findIndex(
          (c) => c.meta.slug === destination.chapterPath.at(-1),
        );
        if (targetIndex < 0) return { ok: false, error: "Destination chapter not found." };
        order = orderForInsert(
          siblings,
          targetIndex,
          position,
          excludedIndex !== undefined && excludedIndex >= 0 ? excludedIndex : undefined,
        );
      }
    }

    const sameBook = source.bookSlug === destBookSlug;
    const sameParent =
      sameBook &&
      source.chapterPath.slice(0, -1).join("/") === parentChapterPath.join("/");

    // Same-book, same-parent, non-inside drop → reorder endpoint.
    if (sameParent && destination.kind === "chapter" && position !== "inside") {
      const siblings = siblingChapters(tree, destBookSlug, parentChapterPath);
      if (!siblings) return { ok: false, error: "Sibling chapters not found." };
      const slugs = siblings.map((c) => c.meta.slug);
      const fromIndex = slugs.indexOf(source.chapterPath.at(-1)!);
      const toIndex = slugs.indexOf(destination.chapterPath.at(-1)!);
      if (fromIndex < 0 || toIndex < 0) {
        return { ok: false, error: "Sibling chapter index not found." };
      }
      const without = slugs.filter((_, i) => i !== fromIndex);
      const insertAt = orderForInsert(without, toIndex, position, fromIndex) - 1;
      const reordered = [
        ...without.slice(0, insertAt),
        source.chapterPath.at(-1)!,
        ...without.slice(insertAt),
      ];
      return {
        ok: true,
        call: {
          method: "POST",
          url: `/api/books/${encodeURIComponent(destBookSlug)}/chapters/reorder`,
          body: { parentChapterPath, chapterSlugs: reordered, revision: rev },
        },
      };
    }

    return {
      ok: true,
      call: {
        method: "POST",
        url: `/api/books/${encodeURIComponent(source.bookSlug)}/chapters/move`,
        body: {
          chapterPath: source.chapterPath,
          ...(destBookSlug !== source.bookSlug ? { destinationBookSlug: destBookSlug } : {}),
          parentChapterPath,
          ...(order !== undefined ? { order } : {}),
          revision: rev,
        },
      },
    };
  }

  return {
    ok: false,
    error: `Unsupported drop: ${source.kind} → ${destination.kind}`,
  };
}
