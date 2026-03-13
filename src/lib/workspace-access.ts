import type { SessionPayload } from "@/lib/auth";
import { getContentTree } from "@/lib/content/service";
import type {
  ContentRecord,
  ContentSearchResult,
  ContentTree,
  ManifestEntry,
  MediaAsset,
  MediaReference,
} from "@/lib/content/schemas";
import { getUserByUsername, type UserAssignments } from "@/lib/user-store";

const EMPTY_ASSIGNMENTS: UserAssignments = {
  bookIds: [],
  noteIds: [],
};

export type WorkspaceAccessScope = {
  session: SessionPayload;
  isAdmin: boolean;
  assignments: UserAssignments;
  accessibleBookIds: Set<string>;
  accessibleNoteIds: Set<string>;
  accessibleBookSlugs: Set<string>;
  accessibleNoteSlugs: Set<string>;
};

function normalizeAssignments(assignments?: Partial<UserAssignments> | null): UserAssignments {
  return {
    bookIds: Array.from(new Set(assignments?.bookIds ?? [])).sort((left, right) =>
      left.localeCompare(right),
    ),
    noteIds: Array.from(new Set(assignments?.noteIds ?? [])).sort((left, right) =>
      left.localeCompare(right),
    ),
  };
}

function mediaReferenceBookSlug(reference: MediaReference) {
  if (reference.kind !== "book" && reference.kind !== "chapter") {
    return null;
  }

  const [, firstSegment, bookSlug] = reference.route.split("/");
  if (firstSegment !== "books" || !bookSlug) {
    return null;
  }
  return bookSlug;
}

function mediaReferenceNoteSlug(reference: MediaReference) {
  if (reference.kind !== "note") {
    return null;
  }

  const [, firstSegment, slug] = reference.route.split("/");
  if (firstSegment !== "notes" || !slug) {
    return null;
  }
  return slug;
}

export async function buildWorkspaceAccessScope(
  session: SessionPayload,
  tree?: ContentTree,
): Promise<WorkspaceAccessScope> {
  if (session.role === "admin") {
    return {
      session,
      isAdmin: true,
      assignments: EMPTY_ASSIGNMENTS,
      accessibleBookIds: new Set<string>(),
      accessibleNoteIds: new Set<string>(),
      accessibleBookSlugs: new Set<string>(),
      accessibleNoteSlugs: new Set<string>(),
    };
  }

  const [user, resolvedTree] = await Promise.all([
    getUserByUsername(session.username),
    tree ? Promise.resolve(tree) : getContentTree(),
  ]);
  const assignments = normalizeAssignments(user?.assignments);
  const accessibleBooks = resolvedTree.books.filter((book) =>
    assignments.bookIds.includes(book.meta.id),
  );
  const accessibleNotes = resolvedTree.notes.filter((note) =>
    assignments.noteIds.includes(note.meta.id),
  );

  return {
    session,
    isAdmin: false,
    assignments,
    accessibleBookIds: new Set(accessibleBooks.map((book) => book.meta.id)),
    accessibleNoteIds: new Set(accessibleNotes.map((note) => note.meta.id)),
    accessibleBookSlugs: new Set(accessibleBooks.map((book) => book.meta.slug)),
    accessibleNoteSlugs: new Set(accessibleNotes.map((note) => note.meta.slug)),
  };
}

export function canAccessBook(
  scope: WorkspaceAccessScope,
  book: { meta: { id: string } },
) {
  return scope.isAdmin || scope.accessibleBookIds.has(book.meta.id);
}

export function canAccessNote(
  scope: WorkspaceAccessScope,
  note: { meta: { id: string } },
) {
  return scope.isAdmin || scope.accessibleNoteIds.has(note.meta.id);
}

export function canAccessChapter(
  scope: WorkspaceAccessScope,
  chapter: { meta: { bookSlug: string } },
) {
  return scope.isAdmin || scope.accessibleBookSlugs.has(chapter.meta.bookSlug);
}

export function canAccessContentRecord(
  scope: WorkspaceAccessScope,
  content: ContentRecord,
) {
  if (content.kind === "book") {
    return canAccessBook(scope, content);
  }
  if (content.kind === "note") {
    return canAccessNote(scope, content);
  }
  return canAccessChapter(scope, content);
}

export function canAccessManifestEntry(
  scope: WorkspaceAccessScope,
  entry: ManifestEntry,
) {
  if (scope.isAdmin) {
    return true;
  }
  if (entry.kind === "book") {
    return scope.accessibleBookIds.has(entry.id);
  }
  if (entry.kind === "note") {
    return scope.accessibleNoteIds.has(entry.id);
  }
  return Boolean(entry.bookSlug && scope.accessibleBookSlugs.has(entry.bookSlug));
}

export function canAccessSearchResult(
  scope: WorkspaceAccessScope,
  result: ContentSearchResult,
) {
  if (scope.isAdmin) {
    return true;
  }
  if (result.kind === "book") {
    return scope.accessibleBookIds.has(result.id);
  }
  if (result.kind === "note") {
    return scope.accessibleNoteIds.has(result.id);
  }
  return Boolean(result.bookSlug && scope.accessibleBookSlugs.has(result.bookSlug));
}

export function canAccessMediaReference(
  scope: WorkspaceAccessScope,
  reference: MediaReference,
) {
  if (scope.isAdmin) {
    return true;
  }
  if (reference.kind === "note") {
    const slug = mediaReferenceNoteSlug(reference);
    return Boolean(slug && scope.accessibleNoteSlugs.has(slug));
  }
  const bookSlug = mediaReferenceBookSlug(reference);
  return Boolean(bookSlug && scope.accessibleBookSlugs.has(bookSlug));
}

export function filterContentTreeForScope(
  tree: ContentTree,
  scope: WorkspaceAccessScope,
): ContentTree {
  if (scope.isAdmin) {
    return tree;
  }

  return {
    books: tree.books.filter((book) => canAccessBook(scope, book)),
    notes: tree.notes.filter((note) => canAccessNote(scope, note)),
  };
}

export function filterManifestEntriesForScope(
  entries: ManifestEntry[],
  scope: WorkspaceAccessScope,
) {
  if (scope.isAdmin) {
    return entries;
  }
  return entries.filter((entry) => canAccessManifestEntry(scope, entry));
}

export function filterBacklinksForScope(
  entries: ManifestEntry[],
  scope: WorkspaceAccessScope,
) {
  return filterManifestEntriesForScope(entries, scope);
}

export function filterSearchResultsForScope(
  results: ContentSearchResult[],
  scope: WorkspaceAccessScope,
) {
  if (scope.isAdmin) {
    return results;
  }
  return results.filter((result) => canAccessSearchResult(scope, result));
}

export function filterMediaAssetsForScope(
  assets: MediaAsset[],
  scope: WorkspaceAccessScope,
) {
  if (scope.isAdmin) {
    return assets;
  }

  return assets.map((asset) => ({
    ...asset,
    references: asset.references.filter((reference) =>
      canAccessMediaReference(scope, reference),
    ),
  }));
}

export function canEditorManageTopLevelContent(session: SessionPayload) {
  return session.role === "admin";
}
