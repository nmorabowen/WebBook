import { describe, expect, it } from "vitest";
import type {
  ContentSearchResult,
  ContentTree,
  ManifestEntry,
  MediaAsset,
} from "@/lib/content/schemas";
import type { WorkspaceAccessScope } from "@/lib/workspace-access";
import {
  filterBacklinksForScope,
  filterContentTreeForScope,
  filterManifestEntriesForScope,
  filterMediaAssetsForScope,
  filterSearchResultsForScope,
} from "@/lib/workspace-access";

function createScope(): WorkspaceAccessScope {
  return {
    session: { username: "editor-one", role: "editor" },
    isAdmin: false,
    assignments: {
      bookIds: ["book-1"],
      noteIds: ["note-1"],
    },
    accessibleBookIds: new Set(["book-1"]),
    accessibleNoteIds: new Set(["note-1"]),
    accessibleBookSlugs: new Set(["book-a"]),
    accessibleNoteSlugs: new Set(["note-a"]),
  };
}

function createTree(): ContentTree {
  return {
    books: [
      {
        meta: {
          id: "book-1",
          kind: "book",
          title: "Book A",
          slug: "book-a",
          createdAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:00.000Z",
          routeAliases: [],
          status: "draft",
        },
        route: "/books/book-a",
        chapters: [
          {
            meta: {
              id: "chapter-1",
              kind: "chapter",
              bookSlug: "book-a",
              title: "Chapter A",
              slug: "chapter-a",
              order: 1,
              createdAt: "2026-03-12T00:00:00.000Z",
              updatedAt: "2026-03-12T00:00:00.000Z",
              routeAliases: [],
              status: "draft",
              allowExecution: true,
            },
            route: "/books/book-a/chapter-a",
            path: ["chapter-a"],
            children: [],
          },
        ],
      },
      {
        meta: {
          id: "book-2",
          kind: "book",
          title: "Book B",
          slug: "book-b",
          createdAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:00.000Z",
          routeAliases: [],
          status: "draft",
        },
        route: "/books/book-b",
        chapters: [],
      },
    ],
    notes: [
      {
        meta: {
          id: "note-1",
          kind: "note",
          title: "Note A",
          slug: "note-a",
          createdAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:00.000Z",
          routeAliases: [],
          status: "draft",
          allowExecution: true,
        },
        route: "/notes/note-a",
        location: { kind: "root" },
      },
      {
        meta: {
          id: "note-2",
          kind: "note",
          title: "Note B",
          slug: "note-b",
          createdAt: "2026-03-12T00:00:00.000Z",
          updatedAt: "2026-03-12T00:00:00.000Z",
          routeAliases: [],
          status: "draft",
          allowExecution: true,
        },
        route: "/notes/note-b",
        location: { kind: "root" },
      },
    ],
  };
}

describe("workspace access filtering", () => {
  it("filters trees, manifest entries, search results, backlinks, and media references", () => {
    const scope = createScope();
    const tree = createTree();
    const manifest: ManifestEntry[] = [
      {
        id: "book-1",
        kind: "book",
        slug: "book-a",
        title: "Book A",
        route: "/books/book-a",
        status: "draft",
      },
      {
        id: "chapter-1",
        kind: "chapter",
        slug: "chapter-a",
        title: "Chapter A",
        route: "/books/book-a/chapter-a",
        status: "draft",
        bookSlug: "book-a",
      },
      {
        id: "book-2",
        kind: "book",
        slug: "book-b",
        title: "Book B",
        route: "/books/book-b",
        status: "draft",
      },
      {
        id: "note-1",
        kind: "note",
        slug: "note-a",
        title: "Note A",
        route: "/notes/note-a",
        status: "draft",
      },
      {
        id: "note-2",
        kind: "note",
        slug: "note-b",
        title: "Note B",
        route: "/notes/note-b",
        status: "draft",
      },
    ];
    const searchResults: ContentSearchResult[] = [
      {
        id: "book-1",
        title: "Book A",
        kind: "book",
        slug: "book-a",
        status: "draft",
        summary: "",
        route: "/app/books/book-a",
        publicRoute: "/books/book-a",
        workspaceRoute: "/app/books/book-a",
      },
      {
        id: "chapter-1",
        title: "Chapter A",
        kind: "chapter",
        slug: "chapter-a",
        bookSlug: "book-a",
        status: "draft",
        summary: "",
        route: "/app/books/book-a/chapters/chapter-a",
        publicRoute: "/books/book-a/chapter-a",
        workspaceRoute: "/app/books/book-a/chapters/chapter-a",
      },
      {
        id: "note-2",
        title: "Note B",
        kind: "note",
        slug: "note-b",
        status: "draft",
        summary: "",
        route: "/app/notes/note-b",
        publicRoute: "/notes/note-b",
        workspaceRoute: "/app/notes/note-b",
      },
    ];
    const mediaAssets: MediaAsset[] = [
      {
        name: "figure.png",
        url: "/media/notes/note-a/figure.png",
        relativePath: "notes/note-a/figure.png",
        folder: "notes/note-a",
        size: 123,
        modifiedAt: "2026-03-12T00:00:00.000Z",
        missing: false,
        references: [
          {
            id: "note-1",
            kind: "note",
            title: "Note A",
            route: "/notes/note-a",
          },
          {
            id: "note-2",
            kind: "note",
            title: "Note B",
            route: "/notes/note-b",
          },
        ],
      },
    ];

    const filteredTree = filterContentTreeForScope(tree, scope);
    expect(filteredTree.books.map((book) => book.meta.slug)).toEqual(["book-a"]);
    expect(filteredTree.notes.map((note) => note.meta.slug)).toEqual(["note-a"]);

    const filteredManifest = filterManifestEntriesForScope(manifest, scope);
    expect(filteredManifest.map((entry) => entry.id)).toEqual([
      "book-1",
      "chapter-1",
      "note-1",
    ]);

    expect(filterBacklinksForScope(manifest, scope).map((entry) => entry.id)).toEqual([
      "book-1",
      "chapter-1",
      "note-1",
    ]);

    expect(filterSearchResultsForScope(searchResults, scope).map((entry) => entry.id)).toEqual([
      "book-1",
      "chapter-1",
    ]);

    expect(filterMediaAssetsForScope(mediaAssets, scope)[0]?.references).toEqual([
      {
        id: "note-1",
        kind: "note",
        title: "Note A",
        route: "/notes/note-a",
      },
    ]);
  });
});
