import { describe, expect, it, vi } from "vitest";
import type { ContentTree } from "@/lib/content/schemas";
import { buildWorkspaceCommandCatalog } from "@/components/workspace/use-command-catalog";

function createTree(): Pick<ContentTree, "books" | "notes"> {
  return {
    books: [
      {
        meta: {
          kind: "book",
          title: "Book A",
          slug: "book-a",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          status: "draft",
        },
        route: "/books/book-a",
        chapters: [
          {
            meta: {
              kind: "chapter",
              bookSlug: "book-a",
              title: "Part One",
              slug: "part-one",
              order: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              status: "draft",
              allowExecution: true,
            },
            route: "/books/book-a/part-one",
            path: ["part-one"],
            children: [],
          },
          {
            meta: {
              kind: "chapter",
              bookSlug: "book-a",
              title: "Part Two",
              slug: "part-two",
              order: 2,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              status: "draft",
              allowExecution: true,
            },
            route: "/books/book-a/part-two",
            path: ["part-two"],
            children: [],
          },
        ],
      },
      {
        meta: {
          kind: "book",
          title: "Book B",
          slug: "book-b",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          status: "draft",
        },
        route: "/books/book-b",
        chapters: [],
      },
    ],
    notes: [
      {
        meta: {
          kind: "note",
          title: "Note A",
          slug: "note-a",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          status: "draft",
          allowExecution: true,
        },
        route: "/notes/note-a",
      },
      {
        meta: {
          kind: "note",
          title: "Note B",
          slug: "note-b",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          status: "draft",
          allowExecution: true,
        },
        route: "/notes/note-b",
      },
    ],
  } as Pick<ContentTree, "books" | "notes">;
}

describe("buildWorkspaceCommandCatalog", () => {
  it("marks boundary commands disabled and runs handlers with expected payloads", async () => {
    const tree = createTree();
    const actions = {
      moveBookByStep: vi.fn().mockResolvedValue({ changed: true }),
      moveNoteByStep: vi.fn().mockResolvedValue({ changed: true }),
      moveChapterByStep: vi.fn().mockResolvedValue({ changed: true }),
    };
    const onOpenChapterMove = vi.fn();

    const commands = buildWorkspaceCommandCatalog({
      tree,
      currentPath: "/app/books/book-a/chapters/part-one",
      actions,
      onOpenChapterMove,
    });

    const bookUp = commands.find((command) => command.id === "book:book-a:up");
    expect(bookUp?.disabledReason).toBe("Already first book");

    const chapterUp = commands.find(
      (command) => command.id === "chapter:book-a:part-one:up",
    );
    expect(chapterUp?.disabledReason).toBe("Already first sibling");

    const chapterDown = commands.find(
      (command) => command.id === "chapter:book-a:part-one:down",
    );
    expect(chapterDown?.disabledReason).toBeUndefined();
    await chapterDown?.run();
    expect(actions.moveChapterByStep).toHaveBeenCalledWith(
      tree,
      "book-a",
      ["part-one"],
      "down",
    );

    const moveTo = commands.find((command) => command.id === "chapter:book-a:part-one:move");
    await moveTo?.run();
    expect(onOpenChapterMove).toHaveBeenCalledWith({
      bookSlug: "book-a",
      chapterPath: ["part-one"],
      chapterTitle: "Part One",
    });
  });

  it("hides book and note commands for editors without top-level permissions", () => {
    const tree = createTree();
    const actions = {
      moveBookByStep: vi.fn().mockResolvedValue({ changed: true }),
      moveNoteByStep: vi.fn().mockResolvedValue({ changed: true }),
      moveChapterByStep: vi.fn().mockResolvedValue({ changed: true }),
    };

    const commands = buildWorkspaceCommandCatalog({
      tree,
      currentPath: "/app/books/book-a/chapters/part-one",
      actions,
      onOpenChapterMove: vi.fn(),
      canManageTopLevel: false,
    });

    expect(commands.some((command) => command.kind === "book")).toBe(false);
    expect(commands.some((command) => command.kind === "note")).toBe(false);
    expect(commands.some((command) => command.kind === "chapter")).toBe(true);
  });
});

