import type { ChapterTreeNode, ContentTree } from "@/lib/content/schemas";

export type ChapterRef = {
  bookSlug: string;
  title: string;
  path: string[];
  parentPath: string[];
  siblingIndex: number;
  siblingCount: number;
};

export function chapterPathKey(bookSlug: string, chapterPath: string[]) {
  return `${bookSlug}/${chapterPath.join("/")}`;
}

export function chapterPathsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

export function chapterPathStartsWith(pathValue: string[], prefix: string[]) {
  return (
    prefix.length <= pathValue.length &&
    prefix.every((segment, index) => pathValue[index] === segment)
  );
}

export function moveSlugByStep(
  slugs: string[],
  slug: string,
  direction: "up" | "down",
) {
  const index = slugs.indexOf(slug);
  if (index < 0) {
    return null;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= slugs.length) {
    return null;
  }

  const next = [...slugs];
  const [entry] = next.splice(index, 1);
  next.splice(targetIndex, 0, entry);
  return next;
}

export function moveSlugToPosition(slugs: string[], slug: string, position: number) {
  const index = slugs.indexOf(slug);
  if (index < 0) {
    return null;
  }

  const targetIndex = Math.max(0, Math.min(slugs.length - 1, position - 1));
  if (targetIndex === index) {
    return [...slugs];
  }

  const next = [...slugs];
  const [entry] = next.splice(index, 1);
  next.splice(targetIndex, 0, entry);
  return next;
}

export function findChapterNode(
  chapters: ChapterTreeNode[],
  chapterPath: string[],
): ChapterTreeNode | null {
  if (!chapterPath.length) {
    return null;
  }

  const [head, ...tail] = chapterPath;
  const chapter = chapters.find((entry) => entry.meta.slug === head);
  if (!chapter) {
    return null;
  }

  if (!tail.length) {
    return chapter;
  }

  return findChapterNode(chapter.children, tail);
}

export function findChapterSiblings(
  chapters: ChapterTreeNode[],
  parentPath: string[],
): ChapterTreeNode[] | null {
  if (!parentPath.length) {
    return chapters;
  }

  const [head, ...tail] = parentPath;
  const parent = chapters.find((entry) => entry.meta.slug === head);
  if (!parent) {
    return null;
  }

  return findChapterSiblings(parent.children, tail);
}

export function flattenBookChapterRefs(
  bookSlug: string,
  chapters: ChapterTreeNode[],
  parentPath: string[] = [],
): ChapterRef[] {
  return chapters.flatMap((chapter, chapterIndex) => {
    const path = [...parentPath, chapter.meta.slug];
    const current: ChapterRef = {
      bookSlug,
      title: chapter.meta.title,
      path,
      parentPath,
      siblingIndex: chapterIndex,
      siblingCount: chapters.length,
    };

    return [current, ...flattenBookChapterRefs(bookSlug, chapter.children, path)];
  });
}

export function parseWorkspaceRoute(pathname: string | undefined) {
  if (!pathname) {
    return null;
  }

  if (pathname.startsWith("/app/books/")) {
    const segments = pathname.split("/").filter(Boolean);
    const bookSlug = segments[2];
    const chapterPath = segments[4] === "chapters" ? segments.slice(5) : [];
    if (!bookSlug) {
      return null;
    }

    if (chapterPath.length) {
      return {
        kind: "chapter" as const,
        bookSlug,
        chapterPath,
      };
    }

    return {
      kind: "book" as const,
      slug: bookSlug,
    };
  }

  if (pathname.startsWith("/app/notes/")) {
    const segments = pathname.split("/").filter(Boolean);
    const slug = segments[2];
    if (!slug) {
      return null;
    }

    return {
      kind: "note" as const,
      slug,
    };
  }

  return null;
}

export function flattenWorkspaceTree(tree: Pick<ContentTree, "books" | "notes">) {
  return {
    books: tree.books,
    notes: tree.notes,
    chapters: tree.books.flatMap((book) => flattenBookChapterRefs(book.meta.slug, book.chapters)),
  };
}

