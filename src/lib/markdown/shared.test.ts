import { describe, expect, it } from "vitest";
import type { ManifestEntry } from "@/lib/content/schemas";
import { extractCodeCells, extractToc, resolveWikiTargetFromManifest } from "./shared";

describe("markdown shared helpers", () => {
  it("extracts a table of contents from headings", () => {
    const toc = extractToc("# Title\n\n## Section\n\n### Detail");
    expect(toc).toEqual([
      { depth: 1, value: "Title", id: "title" },
      { depth: 2, value: "Section", id: "section" },
      { depth: 3, value: "Detail", id: "detail" },
    ]);
  });

  it("ignores frontmatter and block math when extracting a table of contents", () => {
    const toc = extractToc(`---
title: CST
slug: cst
---

## Interpolacion Lineal

$$
f(x,y)=a_0+a_1x+a_2y
\\tag{1}
$$

## Derivadas Parciales`);

    expect(toc).toEqual([
      { depth: 2, value: "Interpolacion Lineal", id: "interpolacion-lineal" },
      { depth: 2, value: "Derivadas Parciales", id: "derivadas-parciales" },
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

  it("resolves wiki links for pages and headings from the manifest", () => {
    const manifest: ManifestEntry[] = [
      {
        id: "book:fem",
        kind: "book",
        slug: "fem",
        title: "FEM",
        route: "/books/fem",
        status: "published",
        headings: [{ id: "introduccion", value: "Introduccion", depth: 1 }],
      },
      {
        id: "chapter:fem/cst",
        kind: "chapter",
        slug: "cst",
        title: "Constant Strain Triangle",
        route: "/books/fem/cst",
        status: "published",
        bookSlug: "fem",
        headings: [{ id: "derivadas-parciales", value: "Derivadas Parciales", depth: 2 }],
      },
      {
        id: "note:webbook-notes",
        kind: "note",
        slug: "webbook-notes",
        title: "WebBook Notes",
        route: "/notes/webbook-notes",
        status: "published",
      },
    ];

    expect(resolveWikiTargetFromManifest(manifest, "webbook-notes")).toEqual({
      route: "/notes/webbook-notes",
      title: "WebBook Notes",
    });

    expect(resolveWikiTargetFromManifest(manifest, "fem/cst#Derivadas Parciales")).toEqual({
      route: "/books/fem/cst#derivadas-parciales",
      title: "Derivadas Parciales",
    });

    expect(resolveWikiTargetFromManifest(manifest, "fem#Introduccion")).toEqual({
      route: "/books/fem#introduccion",
      title: "Introduccion",
    });

    expect(resolveWikiTargetFromManifest(manifest, "fem/cst#Missing")).toBeNull();
  });
});
