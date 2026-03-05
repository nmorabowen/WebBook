import { describe, expect, it } from "vitest";
import { buildChapterNumberIndex, getChapterNumberByPath, nestedChapterNumber } from "@/lib/chapter-numbering";

describe("chapter numbering", () => {
  it("builds nested numbers by sibling index", () => {
    const chapters = [
      {
        path: ["intro"],
        children: [],
      },
      {
        path: ["part-a"],
        children: [
          {
            path: ["part-a", "setup"],
            children: [],
          },
          {
            path: ["part-a", "examples"],
            children: [
              {
                path: ["part-a", "examples", "advanced"],
                children: [],
              },
            ],
          },
        ],
      },
      {
        path: ["part-b"],
        children: [],
      },
    ];

    const numbers = buildChapterNumberIndex(chapters);
    expect(numbers.get("intro")).toBe("1");
    expect(numbers.get("part-a")).toBe("2");
    expect(numbers.get("part-a/setup")).toBe("2.1");
    expect(numbers.get("part-a/examples")).toBe("2.2");
    expect(numbers.get("part-a/examples/advanced")).toBe("2.2.1");
    expect(numbers.get("part-b")).toBe("3");
  });

  it("resolves a chapter number from a chapter path", () => {
    const chapters = [
      {
        path: ["chapter-one"],
        children: [],
      },
      {
        path: ["chapter-two"],
        children: [
          {
            path: ["chapter-two", "subchapter"],
            children: [],
          },
        ],
      },
    ];

    expect(getChapterNumberByPath(chapters, ["chapter-two", "subchapter"])).toBe("2.1");
    expect(getChapterNumberByPath(chapters, ["missing"])).toBeNull();
  });

  it("formats a nested chapter number from parent and index", () => {
    expect(nestedChapterNumber("", 0)).toBe("1");
    expect(nestedChapterNumber("2", 0)).toBe("2.1");
    expect(nestedChapterNumber("2.3", 1)).toBe("2.3.2");
  });
});

