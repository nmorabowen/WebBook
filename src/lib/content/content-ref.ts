/**
 * Unified identifier for any content node (book, chapter, note, scoped note).
 *
 * Phase-2 refactor foundation: every service operation eventually takes a
 * ContentRef instead of a kind-specific `(slug, chapterPath?)` tuple. This
 * lets notes live anywhere in the tree (root, book, chapter) without the
 * service layer branching on `kind`.
 *
 * For Slice J, only the three legacy shapes are representable — the scoped
 * note variants are added in Slice L when storage actually supports them.
 */
export type ContentRef =
  | { kind: "book"; bookSlug: string }
  | { kind: "chapter"; bookSlug: string; chapterPath: string[] }
  | { kind: "note"; slug: string };

/**
 * Filesystem-style path for a ref — the same shape as the eventual
 * on-disk layout post-migration.
 *
 * Examples:
 *   book:    ["books", "fem"]
 *   chapter: ["books", "fem", "chapters", "intro"]
 *   deep:    ["books", "fem", "chapters", "intro", "chapters", "preface"]
 *   note:    ["notes", "python-setup"]
 *
 * Callers that want to construct a ref from a URL or a drag-drop event
 * should decode a path with {@link decodeContentRef}, not build the union
 * by hand.
 */
export function encodeContentRef(ref: ContentRef): string[] {
  switch (ref.kind) {
    case "book":
      return ["books", ref.bookSlug];
    case "chapter": {
      if (!ref.chapterPath.length) {
        throw new Error("Chapter ref requires at least one path segment");
      }
      const out: string[] = ["books", ref.bookSlug];
      for (const segment of ref.chapterPath) {
        out.push("chapters", segment);
      }
      return out;
    }
    case "note":
      return ["notes", ref.slug];
  }
}

/**
 * Parse a filesystem-style path back into a {@link ContentRef}.
 * Returns null for malformed input — callers should treat that as 404.
 */
export function decodeContentRef(path: readonly string[]): ContentRef | null {
  if (path.length < 2) return null;

  if (path[0] === "notes") {
    if (path.length !== 2) return null;
    if (!path[1]) return null;
    return { kind: "note", slug: path[1] };
  }

  if (path[0] === "books") {
    if (!path[1]) return null;
    const bookSlug = path[1];
    if (path.length === 2) return { kind: "book", bookSlug };

    // After "books/<slug>", every chapter level is a ("chapters", "<slug>") pair.
    const rest = path.slice(2);
    if (rest.length % 2 !== 0) return null;
    const chapterPath: string[] = [];
    for (let i = 0; i < rest.length; i += 2) {
      if (rest[i] !== "chapters") return null;
      const segment = rest[i + 1];
      if (!segment) return null;
      chapterPath.push(segment);
    }
    return { kind: "chapter", bookSlug, chapterPath };
  }

  return null;
}

/**
 * Structural equality for refs. Useful for drag-drop guards and test helpers.
 */
export function contentRefsEqual(a: ContentRef, b: ContentRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "book" && b.kind === "book") return a.bookSlug === b.bookSlug;
  if (a.kind === "note" && b.kind === "note") return a.slug === b.slug;
  if (a.kind === "chapter" && b.kind === "chapter") {
    return (
      a.bookSlug === b.bookSlug &&
      a.chapterPath.length === b.chapterPath.length &&
      a.chapterPath.every((seg, i) => seg === b.chapterPath[i])
    );
  }
  return false;
}
