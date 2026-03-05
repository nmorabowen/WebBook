import { describe, expect, it } from "vitest";
import type { ChapterTreeNode } from "@/lib/content/schemas";
import { buildChapterMoveDestinationOptions } from "@/components/workspace/use-chapter-move-options";

function chapterNode(
  slug: string,
  title: string,
  path: string[],
  children: ChapterTreeNode[] = [],
): ChapterTreeNode {
  return {
    meta: {
      kind: "chapter",
      bookSlug: "demo-book",
      title,
      slug,
      order: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      status: "draft",
      allowExecution: true,
    },
    route: `/books/demo-book/${path.join("/")}`,
    path,
    children,
  };
}

describe("buildChapterMoveDestinationOptions", () => {
  it("excludes self and descendants from destination options", () => {
    const chapters = [
      chapterNode("part-a", "Part A", ["part-a"], [
        chapterNode("child-a", "Child A", ["part-a", "child-a"], [
          chapterNode("leaf-a", "Leaf A", ["part-a", "child-a", "leaf-a"]),
        ]),
      ]),
      chapterNode("part-b", "Part B", ["part-b"]),
    ];

    const options = buildChapterMoveDestinationOptions(chapters, ["part-a"]);
    const keys = options.map((option) => option.key);

    expect(keys).toContain("");
    expect(keys).toContain("part-b");
    expect(keys).not.toContain("part-a");
    expect(keys).not.toContain("part-a/child-a");
    expect(keys).not.toContain("part-a/child-a/leaf-a");
  });

  it("keeps ancestor destinations when moving a nested chapter", () => {
    const chapters = [
      chapterNode("part-a", "Part A", ["part-a"], [
        chapterNode("child-a", "Child A", ["part-a", "child-a"]),
      ]),
      chapterNode("part-b", "Part B", ["part-b"]),
    ];

    const options = buildChapterMoveDestinationOptions(chapters, ["part-a", "child-a"]);
    const keys = options.map((option) => option.key);

    expect(keys).toContain("part-a");
    expect(keys).toContain("part-b");
    expect(keys).not.toContain("part-a/child-a");
  });
});

