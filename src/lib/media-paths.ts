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
    const [bookSlug, chapterSlug] = chapterTarget.split("/");
    if (bookSlug && chapterSlug) {
      return `books/${bookSlug}/chapters/${chapterSlug}`;
    }

    if (bookSlug) {
      return `books/${bookSlug}/chapters`;
    }

    return "books/chapters";
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
