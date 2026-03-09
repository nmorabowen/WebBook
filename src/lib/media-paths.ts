import path from "path";

export function defaultUploadTargetPath(pageId: string) {
  if (pageId.startsWith("book:")) {
    const bookSlug = pageId.slice("book:".length).trim();
    return bookSlug ? `books/${bookSlug}` : "books";
  }

  if (pageId.startsWith("note:")) {
    const noteSlug = pageId.slice("note:".length).trim();
    return noteSlug ? `notes/${noteSlug}` : "notes";
  }

  if (pageId.startsWith("chapter:")) {
    const chapterTarget = pageId.slice("chapter:".length).trim();
    const [bookSlug, ...chapterPath] = chapterTarget.split("/").filter(Boolean);
    if (bookSlug && chapterPath.length > 0) {
      return `books/${bookSlug}/chapters/${chapterPath.join("/")}`;
    }

    if (bookSlug) {
      return `books/${bookSlug}/chapters`;
    }

    return "books/chapters";
  }

  return "uploads";
}

export function defaultUploadTargetPathForRoute(
  mode: "book" | "note" | "chapter",
  publicRoute?: string,
) {
  if (!publicRoute) {
    return "uploads";
  }

  const segments = publicRoute.split("/").filter(Boolean);
  if (mode === "note" && segments[0] === "notes" && segments[1]) {
    return `notes/${segments[1]}`;
  }

  if (mode === "book" && segments[0] === "books" && segments[1]) {
    return `books/${segments[1]}`;
  }

  if (mode === "chapter" && segments[0] === "books" && segments[1] && segments.length > 2) {
    return `books/${segments[1]}/chapters/${segments.slice(2).join("/")}`;
  }

  return "uploads";
}

export function normalizeMediaTargetPath(input: string) {
  return input
    .split(/[\\/]+/)
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("/");
}

export function mediaUrlToRelativePath(url: string) {
  const normalized = decodeURIComponent(url.trim());
  if (!normalized.startsWith("/media/")) {
    throw new Error("Invalid media URL");
  }

  const relativePath = normalized.slice("/media/".length).replace(/^\/+|\/+$/g, "");
  if (!relativePath) {
    throw new Error("Invalid media URL");
  }

  return relativePath;
}

export function mediaRelativePathToUrl(relativePath: string) {
  return `/media/${relativePath.split(path.sep).join("/")}`;
}
