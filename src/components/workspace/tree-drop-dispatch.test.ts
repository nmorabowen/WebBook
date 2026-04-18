import { describe, expect, it } from "vitest";
import { dispatchTreeDrop, type NodeRef } from "@/components/workspace/tree-drop-dispatch";
import type { BookMeta, ChapterMeta, ContentTree, NoteMeta } from "@/lib/content/schemas";

function book(slug: string): BookMeta {
  return { slug, title: slug, status: "draft" } as unknown as BookMeta;
}
function chap(slug: string): ChapterMeta {
  return { slug, title: slug, status: "draft" } as unknown as ChapterMeta;
}
function note(slug: string): NoteMeta {
  return { slug, title: slug, status: "draft" } as unknown as NoteMeta;
}

function tree(): ContentTree {
  return {
    books: [
      {
        meta: book("alpha"),
        route: "/books/alpha",
        chapters: [
          {
            meta: chap("intro"),
            route: "/r/a/intro",
            path: ["intro"],
            children: [
              { meta: chap("deep"), route: "/r/a/intro/deep", path: ["intro", "deep"], children: [] },
            ],
          },
          { meta: chap("body"), route: "/r/a/body", path: ["body"], children: [] },
          { meta: chap("end"), route: "/r/a/end", path: ["end"], children: [] },
        ],
      },
      {
        meta: book("beta"),
        route: "/books/beta",
        chapters: [
          { meta: chap("one"), route: "/r/b/one", path: ["one"], children: [] },
        ],
      },
    ],
    notes: [
      { meta: note("n1"), route: "/n/n1", location: { kind: "root" } },
      { meta: note("n2"), route: "/n/n2", location: { kind: "root" } },
      { meta: note("n3"), route: "/n/n3", location: { kind: "root" } },
    ],
  };
}

const rev = "rev-1";

describe("dispatchTreeDrop", () => {
  it("same-ref drops are rejected", () => {
    const r: NodeRef = { kind: "book", slug: "alpha" };
    const result = dispatchTreeDrop({
      source: r,
      destination: r,
      position: "after",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(false);
  });

  it("book → book (after) reorders via /api/books/reorder", () => {
    const result = dispatchTreeDrop({
      source: { kind: "book", slug: "alpha" },
      destination: { kind: "book", slug: "beta" },
      position: "after",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/books/reorder");
    expect(result.call.body).toEqual({ bookSlugs: ["beta", "alpha"], revision: rev });
  });

  it("book → book (before) reorders correctly", () => {
    const result = dispatchTreeDrop({
      source: { kind: "book", slug: "beta" },
      destination: { kind: "book", slug: "alpha" },
      position: "before",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.body).toEqual({ bookSlugs: ["beta", "alpha"], revision: rev });
  });

  it("book → book with position=inside is rejected", () => {
    const result = dispatchTreeDrop({
      source: { kind: "book", slug: "alpha" },
      destination: { kind: "book", slug: "beta" },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(false);
  });

  it("note → note reorders via /api/notes/reorder", () => {
    const result = dispatchTreeDrop({
      source: { kind: "note", slug: "n1" },
      destination: { kind: "note", slug: "n3" },
      position: "after",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/notes/reorder");
    expect(result.call.body).toEqual({ noteSlugs: ["n2", "n3", "n1"], revision: rev });
  });

  it("chapter → notes-root demotes via /api/notes/from-chapter", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["body"] },
      destination: { kind: "notes-root" },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/notes/from-chapter");
    expect(result.call.body).toEqual({
      bookSlug: "alpha",
      chapterPath: ["body"],
      revision: rev,
    });
  });

  it("chapter → note (after) demotes with order", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["body"] },
      destination: { kind: "note", slug: "n1" },
      position: "after",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.body).toMatchObject({
      bookSlug: "alpha",
      chapterPath: ["body"],
      order: 2,
      revision: rev,
    });
  });

  it("note → book (inside) promotes to root chapter", () => {
    const result = dispatchTreeDrop({
      source: { kind: "note", slug: "n1" },
      destination: { kind: "book", slug: "alpha" },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/notes/n1/move");
    expect(result.call.body).toEqual({
      destinationBookSlug: "alpha",
      parentChapterPath: [],
      revision: rev,
    });
  });

  it("note → chapter (inside) promotes as child", () => {
    const result = dispatchTreeDrop({
      source: { kind: "note", slug: "n1" },
      destination: { kind: "chapter", bookSlug: "alpha", chapterPath: ["intro"] },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.body).toMatchObject({
      destinationBookSlug: "alpha",
      parentChapterPath: ["intro"],
      revision: rev,
    });
  });

  it("note → chapter (before) promotes as sibling with order", () => {
    const result = dispatchTreeDrop({
      source: { kind: "note", slug: "n1" },
      destination: { kind: "chapter", bookSlug: "alpha", chapterPath: ["body"] },
      position: "before",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.body).toMatchObject({
      destinationBookSlug: "alpha",
      parentChapterPath: [],
      order: 2,
      revision: rev,
    });
  });

  it("chapter → book (inside, same book) moves to root level", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["intro", "deep"] },
      destination: { kind: "book", slug: "alpha" },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/books/alpha/chapters/move");
    expect(result.call.body).toEqual({
      chapterPath: ["intro", "deep"],
      parentChapterPath: [],
      revision: rev,
    });
  });

  it("chapter → book (inside, cross-book) includes destinationBookSlug", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["body"] },
      destination: { kind: "book", slug: "beta" },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/books/alpha/chapters/move");
    expect(result.call.body).toEqual({
      chapterPath: ["body"],
      destinationBookSlug: "beta",
      parentChapterPath: [],
      revision: rev,
    });
  });

  it("chapter → chapter (inside) nests under destination", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["body"] },
      destination: { kind: "chapter", bookSlug: "alpha", chapterPath: ["intro"] },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.body).toMatchObject({
      chapterPath: ["body"],
      parentChapterPath: ["intro"],
      revision: rev,
    });
    expect(result.call.body).not.toHaveProperty("destinationBookSlug");
  });

  it("chapter → own descendant is rejected", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["intro"] },
      destination: { kind: "chapter", bookSlug: "alpha", chapterPath: ["intro", "deep"] },
      position: "inside",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/descendant/i);
  });

  it("chapter → sibling (same parent, after) uses reorder endpoint", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["intro"] },
      destination: { kind: "chapter", bookSlug: "alpha", chapterPath: ["end"] },
      position: "after",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/books/alpha/chapters/reorder");
    expect(result.call.body).toEqual({
      parentChapterPath: [],
      chapterSlugs: ["body", "end", "intro"],
      revision: rev,
    });
  });

  it("chapter → chapter cross-book, before → move endpoint with order", () => {
    const result = dispatchTreeDrop({
      source: { kind: "chapter", bookSlug: "beta", chapterPath: ["one"] },
      destination: { kind: "chapter", bookSlug: "alpha", chapterPath: ["body"] },
      position: "before",
      tree: tree(),
      revision: rev,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.url).toBe("/api/books/beta/chapters/move");
    expect(result.call.body).toMatchObject({
      chapterPath: ["one"],
      destinationBookSlug: "alpha",
      parentChapterPath: [],
      order: 2,
      revision: rev,
    });
  });

  it("revision passed through when null becomes undefined", () => {
    const result = dispatchTreeDrop({
      source: { kind: "note", slug: "n1" },
      destination: { kind: "note", slug: "n2" },
      position: "after",
      tree: tree(),
      revision: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.call.body.revision).toBeUndefined();
  });
});
