import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-content-test";

async function loadService() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./service");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), {
    recursive: true,
    force: true,
  });
});

describe("content service", () => {
  it("creates a sample content scaffold and searchable content", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    const tree = await service.getContentTree();
    expect(tree.books.length).toBeGreaterThan(0);
    expect(tree.notes.length).toBeGreaterThan(0);

    const searchResults = await service.searchContent("Computational");
    expect(searchResults[0]?.title).toContain("Computational");
  });

  it("reorders book chapters safely and rewrites their order metadata", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Finite Elements",
      slug: "finite-elements",
      description: "Testing chapter reordering",
      body: "# Finite Elements",
      status: "draft",
      visibility: "private",
      theme: "paper",
    });

    await service.createChapter("finite-elements", {
      title: "Direct Stiffness Method",
      slug: "direct-stiffness-method",
      summary: "",
      body: "# Direct Stiffness Method",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("finite-elements", {
      title: "Plane Stress Element",
      slug: "plane-stress-element",
      summary: "",
      body: "# Plane Stress Element",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    const reordered = await service.reorderBookChapters("finite-elements", {
      chapterSlugs: ["plane-stress-element", "direct-stiffness-method"],
    });

    expect(reordered?.chapters.map((chapter) => chapter.meta.slug)).toEqual([
      "plane-stress-element",
      "direct-stiffness-method",
    ]);
    expect(reordered?.chapters.map((chapter) => chapter.meta.order)).toEqual([1, 2]);

    const chapterFiles = await fs.readdir(
      path.join(process.cwd(), tempRoot, "books", "finite-elements", "chapters"),
    );

    expect(chapterFiles).toEqual([
      "001-plane-stress-element.md",
      "002-direct-stiffness-method.md",
    ]);
  });

  it("filters the public tree and duplicates a book with draft visibility", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Private Draft Book",
      slug: "private-draft-book",
      description: "Should not appear publicly",
      body: "# Private Draft Book",
      status: "draft",
      visibility: "private",
      theme: "paper",
      fontPreset: "lato",
    });

    await service.createBook({
      title: "Public Structural Book",
      slug: "public-structural-book",
      description: "Should appear publicly",
      body: "# Public Structural Book",
      status: "published",
      visibility: "public",
      theme: "paper",
      fontPreset: "oswald",
      typography: {
        bodyFontSize: 1.18,
        bodyLineHeight: 2,
        headingBaseSize: 4.1,
        headingScale: 1.28,
        headingIndentStep: 0.45,
        paragraphSpacing: 1.25,
        contentWidth: 52,
      },
    });

    await service.createChapter("public-structural-book", {
      title: "Beam Element",
      slug: "beam-element",
      summary: "Published chapter",
      body: "# Beam Element",
      status: "published",
      allowExecution: true,
      order: 1,
    });

    const duplicate = await service.duplicateBook("public-structural-book");
    const publicTree = await service.getPublicContentTree();

    expect(publicTree.books.map((book) => book.meta.slug)).toContain("public-structural-book");
    expect(publicTree.books.map((book) => book.meta.slug)).not.toContain("private-draft-book");
    expect(duplicate?.meta.visibility).toBe("private");
    expect(duplicate?.meta.status).toBe("draft");
    expect(duplicate?.chapters).toHaveLength(1);
    expect(duplicate?.meta.fontPreset).toBe("oswald");
    expect(duplicate?.meta.typography?.headingIndentStep).toBe(0.45);
    expect(duplicate?.meta.typography?.contentWidth).toBe(52);
  });

  it("duplicates and deletes chapters while keeping chapter order contiguous", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Chapter Actions",
      slug: "chapter-actions",
      description: "Testing chapter menu actions",
      body: "# Chapter Actions",
      status: "draft",
      visibility: "private",
      theme: "paper",
    });

    await service.createChapter("chapter-actions", {
      title: "First Chapter",
      slug: "first-chapter",
      summary: "",
      body: "# First",
      status: "draft",
      allowExecution: true,
      fontPreset: "lato",
      order: 1,
    });

    await service.createChapter("chapter-actions", {
      title: "Second Chapter",
      slug: "second-chapter",
      summary: "",
      body: "# Second",
      status: "draft",
      allowExecution: true,
      fontPreset: "oswald",
      order: 2,
    });

    const duplicate = await service.duplicateChapter(
      "chapter-actions",
      "second-chapter",
    );
    expect(duplicate?.meta.slug).toBe("second-chapter-copy");
    expect(duplicate?.meta.order).toBe(3);
    expect(duplicate?.meta.status).toBe("draft");
    expect(duplicate?.meta.fontPreset).toBe("oswald");

    await service.deleteChapter("chapter-actions", "first-chapter");
    const book = await service.getBook("chapter-actions");

    expect(book.chapters.map((chapter) => chapter.meta.slug)).toEqual([
      "second-chapter",
      "second-chapter-copy",
    ]);
    expect(book.chapters.map((chapter) => chapter.meta.order)).toEqual([1, 2]);
    expect(book.chapters[0]?.meta.fontPreset).toBe("oswald");
  });

  it("persists note typography settings across save, duplicate, and public reads", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createNote({
      title: "Styled Note",
      slug: "styled-note",
      summary: "Note typography test",
      body: "# Styled Note",
      status: "published",
      visibility: "public",
      allowExecution: true,
      fontPreset: "lato",
      typography: {
        bodyFontSize: 1.2,
        bodyLineHeight: 2.1,
        headingBaseSize: 4.3,
        headingScale: 1.3,
        headingIndentStep: 0.6,
        paragraphSpacing: 1.35,
        contentWidth: 64,
      },
    });

    await service.updateNote("styled-note", {
      title: "Styled Note",
      slug: "styled-note",
      summary: "Updated note typography test",
      body: "# Styled Note\n\nBody",
      status: "published",
      visibility: "public",
      allowExecution: true,
      fontPreset: "lato",
      typography: {
        bodyFontSize: 1.16,
        bodyLineHeight: 1.95,
        headingBaseSize: 3.9,
        headingScale: 1.24,
        headingIndentStep: 0.5,
        paragraphSpacing: 1.2,
        contentWidth: 58,
      },
    });

    const note = await service.getNote("styled-note");
    const publicNote = await service.getPublicNote("styled-note");
    const duplicate = await service.duplicateNote("styled-note");

    expect(note?.meta.typography?.bodyFontSize).toBe(1.16);
    expect(note?.meta.typography?.headingIndentStep).toBe(0.5);
    expect(note?.meta.typography?.contentWidth).toBe(58);
    expect(publicNote?.meta.typography?.headingBaseSize).toBe(3.9);
    expect(publicNote?.meta.typography?.paragraphSpacing).toBe(1.2);
    expect(duplicate?.meta.typography?.bodyLineHeight).toBe(1.95);
    expect(duplicate?.meta.typography?.contentWidth).toBe(58);
  });
});
