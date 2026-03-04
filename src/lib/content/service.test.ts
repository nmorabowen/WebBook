import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";

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

    await service.createNote({
      title: "Scaffold Note",
      slug: "scaffold-note",
      summary: "Added by test",
      body: "# Scaffold Note",
      status: "draft",
      allowExecution: true,
    });

    const tree = await service.getContentTree();
    expect(tree.books.length).toBeGreaterThan(0);
    expect(tree.notes.length).toBeGreaterThan(0);

    const searchResults = await service.searchContent("Computational");
    expect(searchResults[0]?.title).toContain("Computational");
  });

  it("exports a persisted user store with the workspace archive", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    const usersFilePath = path.join(process.cwd(), tempRoot, ".webbook", "users.json");
    await expect(fs.access(usersFilePath)).rejects.toThrow();

    const archive = await service.exportWorkspaceArchive();
    const zip = await JSZip.loadAsync(archive);
    const usersFile = zip.file("content/.webbook/users.json");

    expect(usersFile).toBeTruthy();
    await expect(usersFile!.async("string")).resolves.toContain('"username": "admin"');
    await expect(fs.readFile(usersFilePath, "utf8")).resolves.toContain('"username": "admin"');
  });

  it("rejects invalid imported workspaces before replacing current content", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createNote({
      title: "Keep Me",
      slug: "keep-me",
      summary: "Should survive a failed import",
      body: "# Keep Me",
      status: "draft",
      allowExecution: true,
    });

    const archive = await service.exportWorkspaceArchive();
    const zip = await JSZip.loadAsync(archive);
    zip.file("content/books/webbook-handbook/book.md", "---\nslug: broken\n---\nBroken");
    const invalidArchive = await zip.generateAsync({ type: "nodebuffer" });

    await expect(service.importWorkspaceArchive(invalidArchive)).rejects.toThrow(
      "Imported workspace contains an invalid book: books/webbook-handbook/book.md",
    );

    const tree = await service.getContentTree();

    expect(tree.books.some((book) => book.meta.slug === "webbook-handbook")).toBe(true);
    expect(tree.notes.some((note) => note.meta.slug === "keep-me")).toBe(true);
    await expect(
      fs.readFile(path.join(process.cwd(), tempRoot, "notes", "keep-me.md"), "utf8"),
    ).resolves.toContain("Keep Me");
  });

  it("uses the saved workspace transfer limit for exports", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.updateGeneralSettings({
      ...(await service.getGeneralSettings()),
      workspaceTransferLimitMb: 1,
    });

    const largeUploadPath = path.join(
      process.cwd(),
      tempRoot,
      ".webbook",
      "uploads",
      "oversized.bin",
    );
    await fs.mkdir(path.dirname(largeUploadPath), { recursive: true });
    await fs.writeFile(largeUploadPath, "0123456789".repeat(150_000), "utf8");

    await expect(service.exportWorkspaceArchive()).rejects.toThrow(
      "Workspace archive exceeds the 1 MB limit",
    );
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

  it("filters the public tree and duplicates a draft book", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Private Draft Book",
      slug: "private-draft-book",
      description: "Should not appear publicly",
      body: "# Private Draft Book",
      status: "draft",
      theme: "paper",
      fontPreset: "lato",
    });

    await service.createBook({
      title: "Public Structural Book",
      slug: "public-structural-book",
      description: "Should appear publicly",
      body: "# Public Structural Book",
      status: "published",
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
    expect(duplicate?.meta.status).toBe("draft");
    expect(duplicate?.chapters).toHaveLength(1);
    expect(duplicate?.meta.fontPreset).toBe("oswald");
    expect(duplicate?.meta.typography?.headingIndentStep).toBe(0.45);
    expect(duplicate?.meta.typography?.contentWidth).toBe(52);
  });

  it("keeps draft content out of public manifests, backlinks, and search", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createNote({
      title: "Published Anchor",
      slug: "published-anchor",
      summary: "Public target",
      body: "# Published Anchor",
      status: "published",
      allowExecution: true,
    });

    await service.createNote({
      title: "Published Referrer",
      slug: "published-referrer",
      summary: "Public backlink",
      body: "[[published-anchor]]",
      status: "published",
      allowExecution: true,
    });

    await service.createNote({
      title: "Draft Referrer",
      slug: "draft-referrer",
      summary: "Draft backlink",
      body: "[[published-anchor]]",
      status: "draft",
      allowExecution: true,
    });

    const publicManifest = await service.getPublicManifest();
    const publicBacklinks = await service.getPublicBacklinks("note:published-anchor");
    const publicResults = await service.searchPublicContent("Draft");

    expect(publicManifest.map((entry) => entry.slug)).toContain("published-anchor");
    expect(publicManifest.map((entry) => entry.slug)).not.toContain("draft-referrer");
    expect(publicBacklinks.map((entry) => entry.slug)).toEqual(["published-referrer"]);
    expect(publicResults).toEqual([]);
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

  it("reorders books and notes persistently", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Alpha Book",
      slug: "alpha-book",
      description: "Alpha",
      body: "# Alpha",
      status: "draft",
      theme: "paper",
    });

    await service.createBook({
      title: "Beta Book",
      slug: "beta-book",
      description: "Beta",
      body: "# Beta",
      status: "draft",
      theme: "paper",
    });

    await service.createNote({
      title: "Alpha Note",
      slug: "alpha-note",
      summary: "Alpha",
      body: "# Alpha Note",
      status: "draft",
      allowExecution: true,
    });

    await service.createNote({
      title: "Beta Note",
      slug: "beta-note",
      summary: "Beta",
      body: "# Beta Note",
      status: "draft",
      allowExecution: true,
    });

    await service.reorderBooks({
      bookSlugs: ["beta-book", "webbook-handbook", "alpha-book"],
    });

    const beforeReorder = await service.getContentTree();
    const reorderedNoteSlugs = [
      "beta-note",
      ...beforeReorder.notes
        .map((note) => note.meta.slug)
        .filter((slug) => slug !== "beta-note"),
    ];

    await service.reorderNotes({
      noteSlugs: reorderedNoteSlugs,
    });

    const tree = await service.getContentTree();

    expect(tree.books.map((book) => book.meta.slug)).toEqual([
      "beta-book",
      "webbook-handbook",
      "alpha-book",
    ]);
    expect(tree.notes.map((note) => note.meta.slug)).toEqual(reorderedNoteSlugs);
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

  it("keeps at most three featured books and evicts the oldest featured selection", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    for (const title of ["Book One", "Book Two", "Book Three", "Book Four"]) {
      await service.createBook({
        title,
        slug: title.toLowerCase().replace(/\s+/g, "-"),
        description: `${title} description`,
        body: `# ${title}`,
        status: "published",
        featured: true,
        theme: "paper",
      });
    }

    const tree = await service.getPublicContentTree();
    const featuredBooks = tree.books.filter((book) => book.meta.featured);

    expect(featuredBooks.map((book) => book.meta.slug).sort()).toEqual([
      "book-four",
      "book-three",
      "book-two",
    ]);
    expect(featuredBooks).toHaveLength(3);
    expect(featuredBooks.every((book) => typeof book.meta.featuredAt === "string")).toBe(true);
  });

  it("lists page media, blocks referenced deletes, and soft deletes to trash when forced", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createNote({
      title: "Media Note",
      slug: "media-note",
      summary: "Has media",
      body: "![Figure](/media/notes/media-note/figure.png)",
      status: "draft",
      allowExecution: true,
    });

    const uploadsFilePath = path.join(
      process.cwd(),
      tempRoot,
      ".webbook",
      "uploads",
      "notes",
      "media-note",
      "figure.png",
    );
    await fs.mkdir(path.dirname(uploadsFilePath), { recursive: true });
    await fs.writeFile(uploadsFilePath, "image-bytes", "utf8");

    const listedMedia = await service.listMediaForPage("note:media-note");
    expect(listedMedia).toHaveLength(1);
    expect(listedMedia[0]?.url).toBe("/media/notes/media-note/figure.png");
    expect(listedMedia[0]?.references[0]?.id).toBe("note:media-note");

    const blockedDelete = await service.removeMediaAsset(
      "/media/notes/media-note/figure.png",
    );
    expect(blockedDelete.ok).toBe(false);
    expect(blockedDelete.blocked).toBe(true);

    const forcedDelete = await service.removeMediaAsset(
      "/media/notes/media-note/figure.png",
      true,
    );
    expect(forcedDelete.ok).toBe(true);
    expect(forcedDelete.blocked).toBe(false);

    await expect(fs.access(uploadsFilePath)).rejects.toThrow();

    const trashRoot = path.join(process.cwd(), tempRoot, ".webbook", "trash", "uploads");
    const trashEntries = await fs.readdir(trashRoot);
    expect(trashEntries.length).toBeGreaterThan(0);
  });

  it("rejects duplicate slugs, duplicate chapter orders, and unsafe revision paths", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Unique Book",
      slug: "unique-book",
      description: "Initial book",
      body: "# Unique Book",
      status: "draft",
      theme: "paper",
    });

    await expect(
      service.createBook({
        title: "Duplicate Book",
        slug: "unique-book",
        description: "Duplicate book slug",
        body: "# Duplicate Book",
        status: "draft",
        theme: "paper",
      }),
    ).rejects.toThrow("A book with that slug already exists");

    await service.createNote({
      title: "Unique Note",
      slug: "unique-note",
      summary: "Initial note",
      body: "# Unique Note",
      status: "draft",
      allowExecution: true,
    });

    await expect(
      service.createNote({
        title: "Duplicate Note",
        slug: "unique-note",
        summary: "Duplicate note slug",
        body: "# Duplicate Note",
        status: "draft",
        allowExecution: true,
      }),
    ).rejects.toThrow("A note with that slug already exists");

    await service.createChapter("unique-book", {
      title: "Chapter One",
      slug: "chapter-one",
      summary: "",
      body: "# Chapter One",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await expect(
      service.createChapter("unique-book", {
        title: "Duplicate Chapter Slug",
        slug: "chapter-one",
        summary: "",
        body: "# Duplicate Chapter Slug",
        status: "draft",
        allowExecution: true,
        order: 2,
      }),
    ).rejects.toThrow("A chapter with that slug already exists in this book");

    await expect(
      service.createChapter("unique-book", {
        title: "Duplicate Chapter Order",
        slug: "chapter-two",
        summary: "",
        body: "# Duplicate Chapter Order",
        status: "draft",
        allowExecution: true,
        order: 1,
      }),
    ).rejects.toThrow("A chapter already uses order 1");

    await service.updateNote("unique-note", {
      title: "Unique Note",
      slug: "unique-note",
      summary: "Updated note",
      body: "# Unique Note\n\nUpdated",
      status: "draft",
      allowExecution: true,
      createRevision: true,
    });

    await expect(
      service.restoreRevision({
        id: "note:unique-note",
        revisionFile: "../users.json",
      }),
    ).rejects.toThrow();
  });
});
