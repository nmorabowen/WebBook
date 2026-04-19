import type { NoteRecord } from "@/lib/content/schemas";
import { getContent } from "@/lib/content/service";

/**
 * Detect a chapter-scoped note request masquerading as a chapter URL.
 *
 * Both the workspace handler at `/app/books/[bookSlug]/chapters/
 * [...chapterPath]/page.tsx` and the public handler at `/books/[bookSlug]/
 * [...chapterPath]/page.tsx` receive a single catch-all `chapterPath` —
 * Next.js does not allow two catch-alls in the same route. This helper
 * peels off a trailing `notes/<slug>` and confirms a real note exists at
 * the candidate chapter location, so callers can branch into note
 * rendering without duplicating the chapter URL pattern.
 *
 * Resolution order, when the URL is ambiguous (e.g. a chapter literally
 * named "notes" containing a child chapter that shares the trailing
 * slug): the note interpretation wins, since it's a direct lookup. Treat
 * `notes` as a reserved chapter slug going forward.
 */
export type ChapterScopedNoteMatch = {
  noteSlug: string;
  chapterPath: string[];
  note: NoteRecord;
};

export async function detectChapterScopedNote(
  bookSlug: string,
  chapterPath: string[],
): Promise<ChapterScopedNoteMatch | null> {
  if (chapterPath.length < 2) return null;
  if (chapterPath[chapterPath.length - 2] !== "notes") return null;

  const noteSlug = chapterPath[chapterPath.length - 1];
  const candidateChapterPath = chapterPath.slice(0, -2);
  if (candidateChapterPath.length === 0) return null;

  const note = await getContent({ kind: "note", slug: noteSlug });
  if (!note || note.kind !== "note") return null;
  if (
    note.location.kind !== "chapter" ||
    note.location.bookSlug !== bookSlug ||
    note.location.chapterPath.length !== candidateChapterPath.length ||
    !note.location.chapterPath.every((s, i) => s === candidateChapterPath[i])
  ) {
    return null;
  }

  return { noteSlug, chapterPath: candidateChapterPath, note };
}
