import { describe, expect, it } from "vitest";
import { extractCodeCells, extractToc } from "./shared";

describe("markdown shared helpers", () => {
  it("extracts a table of contents from headings", () => {
    const toc = extractToc("# Title\n\n## Section\n\n### Detail");
    expect(toc).toEqual([
      { depth: 1, value: "Title", id: "title" },
      { depth: 2, value: "Section", id: "section" },
      { depth: 3, value: "Detail", id: "detail" },
    ]);
  });

  it("extracts executable code cells and metadata", () => {
    const cells = extractCodeCells(
      "```python exec id=cell-1\nprint('hi')\n```\n\n```ts\nconsole.log('x')\n```",
    );
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({
      id: "cell-1",
      language: "python",
      executable: true,
      runtime: "python",
    });
    expect(cells[1]).toMatchObject({
      language: "ts",
      executable: false,
    });
  });
});
