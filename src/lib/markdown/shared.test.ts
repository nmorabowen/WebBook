import { describe, expect, it } from "vitest";
import type { ManifestEntry } from "@/lib/content/schemas";
import {
  containsMathSyntax,
  extractCodeCells,
  extractToc,
  resolveWikiTargetFromManifest,
} from "./shared";

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

  it("does not throw when markdown begins with invalid frontmatter-like content", () => {
    const toc = extractToc(`---
summary: bad:
oops
---

# Real Heading`);

    expect(toc).toEqual([{ depth: 1, value: "Real Heading", id: "real-heading" }]);
  });

  it("extracts code cells and metadata", () => {
    const cells = extractCodeCells(
      "```python id=cell-1\nprint('hi')\n```\n\n```ts\nconsole.log('x')\n```",
    );
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({
      id: "cell-1",
      language: "python",
    });
    expect(cells[1]).toMatchObject({
      language: "ts",
    });
  });

  it("detects math syntax without flagging ordinary currency text", () => {
    expect(containsMathSyntax("Inline $x^2$ and display $$y=x$$")).toBe(true);
    expect(containsMathSyntax("Escaped \\(a+b\\) still counts")).toBe(true);
    expect(
      containsMathSyntax(`Escaped block math also counts:\n\\[\nA x = b\n\\]`),
    ).toBe(true);
    expect(
      containsMathSyntax(`$$
\\begin{aligned}
f(x) &= x^2 \\\\
g(x) &= x^3
\\end{aligned}
$$`),
    ).toBe(true);
    expect(containsMathSyntax("Price: $25 per book")).toBe(false);
    expect(containsMathSyntax("A fenced code block with $x$ is not real math:\n```txt\n$x$\n```")).toBe(
      false,
    );
    expect(containsMathSyntax("No math markers here")).toBe(false);
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

  it("prefers canonical nested chapter aliases and rejects ambiguous legacy aliases", () => {
    const manifest: ManifestEntry[] = [
      {
        id: "chapter:fem/part-one/setup",
        kind: "chapter",
        slug: "setup",
        chapterPath: ["part-one", "setup"],
        title: "Setup A",
        route: "/books/fem/part-one/setup",
        status: "published",
        bookSlug: "fem",
      },
      {
        id: "chapter:fem/part-two/setup",
        kind: "chapter",
        slug: "setup",
        chapterPath: ["part-two", "setup"],
        title: "Setup B",
        route: "/books/fem/part-two/setup",
        status: "published",
        bookSlug: "fem",
      },
      {
        id: "chapter:fem/theory",
        kind: "chapter",
        slug: "theory",
        chapterPath: ["theory"],
        title: "Theory",
        route: "/books/fem/theory",
        status: "published",
        bookSlug: "fem",
      },
    ];

    expect(resolveWikiTargetFromManifest(manifest, "fem/part-one/setup")).toEqual({
      route: "/books/fem/part-one/setup",
      title: "Setup A",
    });
    expect(resolveWikiTargetFromManifest(manifest, "fem/part-two/setup")).toEqual({
      route: "/books/fem/part-two/setup",
      title: "Setup B",
    });

    expect(resolveWikiTargetFromManifest(manifest, "fem/setup")).toBeNull();
    expect(resolveWikiTargetFromManifest(manifest, "setup")).toBeNull();

    expect(resolveWikiTargetFromManifest(manifest, "fem/theory")).toEqual({
      route: "/books/fem/theory",
      title: "Theory",
    });
    expect(resolveWikiTargetFromManifest(manifest, "theory")).toEqual({
      route: "/books/fem/theory",
      title: "Theory",
    });
  });
});
