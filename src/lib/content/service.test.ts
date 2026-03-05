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
    expect(searchResults[0]?.route).toBe("/app/books/webbook-handbook/chapters/computational-chapter");
    expect(searchResults[0]?.publicRoute).toBe("/books/webbook-handbook/computational-chapter");
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

  it("persists the analytics measurement id and preserves other settings on partial updates", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    const initialSettings = await service.getGeneralSettings();
    await service.updateGeneralSettings({
      analyticsMeasurementId: "G-TEST12345",
      analyticsGtmContainerId: "GTM-MRNSLL2K",
    });

    const updatedSettings = await service.getGeneralSettings();

    expect(updatedSettings.analyticsMeasurementId).toBe("G-TEST12345");
    expect(updatedSettings.analyticsGtmContainerId).toBe("GTM-MRNSLL2K");
    expect(updatedSettings.colorTheme).toBe(initialSettings.colorTheme);
    expect(updatedSettings.workspaceTransferLimitMb).toBe(
      initialSettings.workspaceTransferLimitMb,
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

  it("moves a chapter when its order changes and keeps numbering contiguous", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Moveable Chapters",
      slug: "moveable-chapters",
      description: "Testing chapter moves",
      body: "# Moveable Chapters",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("moveable-chapters", {
      title: "First Chapter",
      slug: "first-chapter",
      summary: "",
      body: "# First",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("moveable-chapters", {
      title: "Second Chapter",
      slug: "second-chapter",
      summary: "",
      body: "# Second",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    await service.createChapter("moveable-chapters", {
      title: "Third Chapter",
      slug: "third-chapter",
      summary: "",
      body: "# Third",
      status: "draft",
      allowExecution: true,
      order: 3,
    });

    const moved = await service.updateChapter("moveable-chapters", "third-chapter", {
      title: "Third Chapter",
      slug: "third-chapter",
      summary: "",
      body: "# Third",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    expect(moved?.meta.order).toBe(1);

    const book = await service.getBook("moveable-chapters");
    expect(book.chapters.map((chapter) => chapter.meta.slug)).toEqual([
      "third-chapter",
      "first-chapter",
      "second-chapter",
    ]);
    expect(book.chapters.map((chapter) => chapter.meta.order)).toEqual([1, 2, 3]);

    const chapterFiles = await fs.readdir(
      path.join(process.cwd(), tempRoot, "books", "moveable-chapters", "chapters"),
    );

    expect(chapterFiles).toEqual([
      "001-third-chapter.md",
      "002-first-chapter.md",
      "003-second-chapter.md",
    ]);
  });

  it("creates a chapter for legacy books missing the chapters directory", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Legacy Book",
      slug: "legacy-book",
      description: "Testing missing chapters directory",
      body: "# Legacy Book",
      status: "draft",
      theme: "paper",
    });

    await fs.rm(path.join(process.cwd(), tempRoot, "books", "legacy-book", "chapters"), {
      recursive: true,
      force: true,
    });

    const chapter = await service.createChapter("legacy-book", {
      title: "Recovered Chapter",
      slug: "recovered-chapter",
      summary: "",
      body: "# Recovered",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    expect(chapter?.meta.slug).toBe("recovered-chapter");
    await expect(
      fs.readFile(
        path.join(
          process.cwd(),
          tempRoot,
          "books",
          "legacy-book",
          "chapters",
          "001-recovered-chapter.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("Recovered Chapter");
  });

  it("creates a chapter when another chapter file has malformed front matter", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Create Around Broken Chapter",
      slug: "create-around-broken-chapter",
      description: "Testing chapter creation with malformed sibling",
      body: "# Create Around Broken Chapter",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("create-around-broken-chapter", {
      title: "Broken Chapter",
      slug: "broken-chapter",
      summary: "",
      body: "# Broken",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await fs.writeFile(
      path.join(
        process.cwd(),
        tempRoot,
        "books",
        "create-around-broken-chapter",
        "chapters",
        "001-broken-chapter.md",
      ),
      [
        "---",
        "kind: chapter",
        "bookSlug: create-around-broken-chapter",
        "title: Broken Chapter",
        "slug: broken-chapter",
        "order: 1",
        "summary: bad:",
        "oops",
        "status: draft",
        "allowExecution: true",
        "createdAt: '2026-03-04T00:00:00.000Z'",
        "updatedAt: '2026-03-04T00:00:00.000Z'",
        "---",
        "# Broken",
      ].join("\n"),
      "utf8",
    );

    const chapter = await service.createChapter("create-around-broken-chapter", {
      title: "Healthy Chapter",
      slug: "healthy-chapter",
      summary: "",
      body: "# Healthy",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    expect(chapter?.meta.slug).toBe("healthy-chapter");
    await expect(
      fs.readFile(
        path.join(
          process.cwd(),
          tempRoot,
          "books",
          "create-around-broken-chapter",
          "chapters",
          "002-healthy-chapter.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("Healthy Chapter");
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
    const workspaceResults = await service.searchContent("Draft");

    expect(publicManifest.map((entry) => entry.slug)).toContain("published-anchor");
    expect(publicManifest.map((entry) => entry.slug)).not.toContain("draft-referrer");
    expect(publicBacklinks.map((entry) => entry.slug)).toEqual(["published-referrer"]);
    expect(publicResults).toEqual([]);
    expect(workspaceResults[0]?.route).toBe("/app/notes/draft-referrer");
    expect(workspaceResults[0]?.publicRoute).toBe("/notes/draft-referrer");
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

  it("creates nested chapters with sibling-scoped slug uniqueness and path lookups", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Nested Book",
      slug: "nested-book",
      description: "Nested chapter behavior",
      body: "# Nested Book",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("nested-book", {
      title: "Part One",
      slug: "part-one",
      summary: "",
      body: "# Part One",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("nested-book", {
      title: "Part Two",
      slug: "part-two",
      summary: "",
      body: "# Part Two",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    await service.createChapter("nested-book", {
      title: "Intro A",
      slug: "intro",
      parentChapterPath: ["part-one"],
      summary: "",
      body: "# Intro A",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("nested-book", {
      title: "Intro B",
      slug: "intro",
      parentChapterPath: ["part-two"],
      summary: "",
      body: "# Intro B",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await expect(
      service.createChapter("nested-book", {
        title: "Duplicate Intro",
        slug: "intro",
        parentChapterPath: ["part-one"],
        summary: "",
        body: "# Duplicate Intro",
        status: "draft",
        allowExecution: true,
        order: 2,
      }),
    ).rejects.toThrow("A chapter with that slug already exists in this book");

    const uniqueChild = await service.createChapter("nested-book", {
      title: "Unique Child",
      slug: "unique-child",
      parentChapterPath: ["part-one"],
      summary: "",
      body: "# Unique Child",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    const nestedChapter = await service.getChapter("nested-book", ["part-one", "intro"]);
    expect(nestedChapter?.id).toBe("chapter:nested-book/part-one/intro");
    expect(nestedChapter?.route).toBe("/books/nested-book/part-one/intro");

    expect(await service.getChapter("nested-book", "intro")).toBeNull();
    expect(await service.getChapter("nested-book", "unique-child")).toMatchObject({
      id: uniqueChild?.id,
      path: ["part-one", "unique-child"],
    });

    const book = await service.getBook("nested-book");
    expect(book.chapters.map((chapter) => chapter.meta.slug)).toEqual(["part-one", "part-two"]);
    expect(book.chapters[0]?.children.map((chapter) => chapter.meta.slug)).toEqual([
      "intro",
      "unique-child",
    ]);
    expect(book.chapters[1]?.children.map((chapter) => chapter.meta.slug)).toEqual(["intro"]);
  });

  it("updates nested chapter paths while preserving subtrees and enforcing sibling-only reorder", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Nested Reorder",
      slug: "nested-reorder",
      description: "Nested reorder behavior",
      body: "# Nested Reorder",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("nested-reorder", {
      title: "Part A",
      slug: "part-a",
      summary: "",
      body: "# Part A",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("nested-reorder", {
      title: "Part B",
      slug: "part-b",
      summary: "",
      body: "# Part B",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    await service.createChapter("nested-reorder", {
      title: "Child One",
      slug: "child-one",
      parentChapterPath: ["part-a"],
      summary: "",
      body: "# Child One",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("nested-reorder", {
      title: "Child Two",
      slug: "child-two",
      parentChapterPath: ["part-a"],
      summary: "",
      body: "# Child Two",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    await service.createChapter("nested-reorder", {
      title: "Leaf",
      slug: "leaf",
      parentChapterPath: ["part-a", "child-one"],
      summary: "",
      body: "# Leaf",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("nested-reorder", {
      title: "Other Child",
      slug: "other-child",
      parentChapterPath: ["part-b"],
      summary: "",
      body: "# Other Child",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    const moved = await service.updateChapter("nested-reorder", ["part-a", "child-one"], {
      title: "Child One Renamed",
      slug: "child-one-renamed",
      parentChapterPath: ["part-a"],
      summary: "",
      body: "# Child One Renamed",
      status: "draft",
      allowExecution: true,
      order: 2,
    });
    expect(moved?.path).toEqual(["part-a", "child-one-renamed"]);

    const renamedChapterPath = path.join(
      process.cwd(),
      tempRoot,
      "books",
      "nested-reorder",
      "chapters",
      "001-part-a",
      "chapters",
      "002-child-one-renamed.md",
    );
    const oldChapterPath = path.join(
      process.cwd(),
      tempRoot,
      "books",
      "nested-reorder",
      "chapters",
      "001-part-a",
      "chapters",
      "001-child-one.md",
    );
    const renamedLeafPath = path.join(
      process.cwd(),
      tempRoot,
      "books",
      "nested-reorder",
      "chapters",
      "001-part-a",
      "chapters",
      "002-child-one-renamed",
      "chapters",
      "001-leaf.md",
    );

    await expect(fs.access(renamedChapterPath)).resolves.toBeUndefined();
    await expect(fs.access(renamedLeafPath)).resolves.toBeUndefined();
    await expect(fs.access(oldChapterPath)).rejects.toThrow();

    await expect(
      service.reorderBookChapters("nested-reorder", {
        parentChapterPath: ["part-a"],
        chapterSlugs: ["child-one-renamed", "child-two"],
      }),
    ).resolves.toBeTruthy();

    await expect(
      service.reorderBookChapters("nested-reorder", {
        parentChapterPath: ["part-b"],
        chapterSlugs: ["child-two"],
      }),
    ).rejects.toThrow("Unknown chapter slug: child-two");

    await expect(
      service.updateChapter("nested-reorder", ["part-a", "child-two"], {
        title: "Child Two",
        slug: "child-two",
        parentChapterPath: ["part-b"],
        summary: "",
        body: "# Child Two",
        status: "draft",
        allowExecution: true,
        order: 2,
      }),
    ).rejects.toThrow("Reparenting chapters is not supported");

    const book = await service.getBook("nested-reorder");
    const partA = book.chapters.find((chapter) => chapter.meta.slug === "part-a");
    expect(partA?.children.map((chapter) => chapter.meta.slug)).toEqual([
      "child-one-renamed",
      "child-two",
    ]);
    expect(partA?.children.map((chapter) => chapter.meta.order)).toEqual([1, 2]);
    expect(partA?.children[0]?.children[0]?.path).toEqual([
      "part-a",
      "child-one-renamed",
      "leaf",
    ]);
  });

  it("duplicates and deletes nested chapter subtrees while supporting nested content ids", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Nested Subtree",
      slug: "nested-subtree",
      description: "Nested subtree actions",
      body: "# Nested Subtree",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("nested-subtree", {
      title: "Root",
      slug: "root",
      summary: "",
      body: "# Root",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("nested-subtree", {
      title: "Topic",
      slug: "topic",
      parentChapterPath: ["root"],
      summary: "",
      body: "# Topic",
      status: "published",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("nested-subtree", {
      title: "Detail",
      slug: "detail",
      parentChapterPath: ["root", "topic"],
      summary: "",
      body: "# Detail",
      status: "published",
      allowExecution: true,
      order: 1,
    });

    const duplicate = await service.duplicateChapter("nested-subtree", ["root", "topic"]);
    if (!duplicate) {
      throw new Error("Expected duplicated chapter");
    }
    expect(duplicate.path).toEqual(["root", "topic-copy"]);
    expect(duplicate.meta.status).toBe("draft");
    expect(duplicate.children[0]?.meta.slug).toBe("detail");
    expect(duplicate.children[0]?.meta.status).toBe("draft");

    const canonicalId = `chapter:nested-subtree/${duplicate.path.join("/")}`;
    const byCanonicalId = await service.getContentById(canonicalId);
    expect(byCanonicalId?.id).toBe(canonicalId);

    const byLegacyLeafId = await service.getContentById("chapter:nested-subtree/topic-copy");
    expect(byLegacyLeafId?.id).toBe(canonicalId);

    await service.publishContentById(canonicalId, true);
    expect((await service.getContentById(canonicalId))?.meta.status).toBe("published");

    await service.deleteChapter("nested-subtree", ["root", "topic"]);
    const book = await service.getBook("nested-subtree");
    expect(book.chapters[0]?.children.map((chapter) => chapter.meta.slug)).toEqual(["topic-copy"]);
    expect(book.chapters[0]?.children.map((chapter) => chapter.meta.order)).toEqual([1]);
  });

  it("surfaces the file path when reading a book hits invalid chapter front matter", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Broken Delete Book",
      slug: "broken-delete-book",
      description: "Testing delete parse failures",
      body: "# Broken Delete Book",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("broken-delete-book", {
      title: "Broken Chapter",
      slug: "broken-chapter",
      summary: "",
      body: "# Broken",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    const chapterPath = path.join(
      process.cwd(),
      tempRoot,
      "books",
      "broken-delete-book",
      "chapters",
      "001-broken-chapter.md",
    );

    await fs.writeFile(
      chapterPath,
      [
        "---",
        "title: Broken Chapter",
        "slug: broken-chapter",
        "createdAt: '2026-03-04T00:00:00.000Z'",
        "updatedAt: '2026-03-04T00:00:00.000Z'",
        "kind: chapter",
        "summary: bad:",
        "oops",
        "---",
        "# Broken",
      ].join("\n"),
      "utf8",
    );

    await expect(service.getBook("broken-delete-book")).rejects.toThrow(
      "Invalid content file .tmp-content-test/books/broken-delete-book/chapters/001-broken-chapter.md",
    );
  });

  it("deletes a malformed chapter file and renumbers the remaining chapters", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Delete Broken Chapter",
      slug: "delete-broken-chapter",
      description: "Testing deletion by numbered filename",
      body: "# Delete Broken Chapter",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("delete-broken-chapter", {
      title: "Broken Chapter",
      slug: "broken-chapter",
      summary: "",
      body: "# Broken",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("delete-broken-chapter", {
      title: "Healthy Chapter",
      slug: "healthy-chapter",
      summary: "",
      body: "# Healthy",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    const brokenChapterPath = path.join(
      process.cwd(),
      tempRoot,
      "books",
      "delete-broken-chapter",
      "chapters",
      "001-broken-chapter.md",
    );

    await fs.writeFile(
      brokenChapterPath,
      [
        "---",
        "kind: chapter",
        "bookSlug: delete-broken-chapter",
        "title: Broken Chapter",
        "slug: broken-chapter",
        "order: 1",
        "summary: bad:",
        "oops",
        "status: draft",
        "allowExecution: true",
        "createdAt: '2026-03-04T00:00:00.000Z'",
        "updatedAt: '2026-03-04T00:00:00.000Z'",
        "---",
        "# Broken",
      ].join("\n"),
      "utf8",
    );

    await expect(
      service.deleteChapter("delete-broken-chapter", "broken-chapter"),
    ).resolves.toBeUndefined();

    const book = await service.getBook("delete-broken-chapter");
    expect(book.chapters.map((chapter) => chapter.meta.slug)).toEqual(["healthy-chapter"]);
    expect(book.chapters[0]?.meta.order).toBe(1);

    const chapterFiles = await fs.readdir(
      path.join(process.cwd(), tempRoot, "books", "delete-broken-chapter", "chapters"),
    );
    expect(chapterFiles).toEqual(["001-healthy-chapter.md"]);
  });

  it("moves a valid chapter when a sibling chapter file is malformed", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Move Around Broken Chapter",
      slug: "move-around-broken-chapter",
      description: "Testing chapter move with malformed sibling",
      body: "# Move Around Broken Chapter",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("move-around-broken-chapter", {
      title: "Broken Chapter",
      slug: "broken-chapter",
      summary: "",
      body: "# Broken",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("move-around-broken-chapter", {
      title: "Healthy Chapter",
      slug: "healthy-chapter",
      summary: "",
      body: "# Healthy",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    await fs.writeFile(
      path.join(
        process.cwd(),
        tempRoot,
        "books",
        "move-around-broken-chapter",
        "chapters",
        "001-broken-chapter.md",
      ),
      [
        "---",
        "kind: chapter",
        "bookSlug: move-around-broken-chapter",
        "title: Broken Chapter",
        "slug: broken-chapter",
        "order: 1",
        "summary: bad:",
        "oops",
        "status: draft",
        "allowExecution: true",
        "createdAt: '2026-03-04T00:00:00.000Z'",
        "updatedAt: '2026-03-04T00:00:00.000Z'",
        "---",
        "# Broken",
      ].join("\n"),
      "utf8",
    );

    const moved = await service.updateChapter(
      "move-around-broken-chapter",
      "healthy-chapter",
      {
        title: "Healthy Chapter",
        slug: "healthy-chapter",
        summary: "",
        body: "# Healthy",
        status: "draft",
        allowExecution: true,
        order: 1,
      },
    );

    expect(moved?.meta.order).toBe(1);
    const chapterFiles = await fs.readdir(
      path.join(
        process.cwd(),
        tempRoot,
        "books",
        "move-around-broken-chapter",
        "chapters",
      ),
    );
    expect(chapterFiles).toEqual(["001-healthy-chapter.md", "002-broken-chapter.md"]);
  });

  it("reorders chapters even when one chapter front matter is malformed", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Reorder Broken Chapter",
      slug: "reorder-broken-chapter",
      description: "Testing drag and drop with malformed front matter",
      body: "# Reorder Broken Chapter",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("reorder-broken-chapter", {
      title: "Broken Chapter",
      slug: "broken-chapter",
      summary: "",
      body: "# Broken",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    await service.createChapter("reorder-broken-chapter", {
      title: "Healthy Chapter",
      slug: "healthy-chapter",
      summary: "",
      body: "# Healthy",
      status: "draft",
      allowExecution: true,
      order: 2,
    });

    const brokenChapterPath = path.join(
      process.cwd(),
      tempRoot,
      "books",
      "reorder-broken-chapter",
      "chapters",
      "001-broken-chapter.md",
    );

    await fs.writeFile(
      brokenChapterPath,
      [
        "---",
        "kind: chapter",
        "bookSlug: reorder-broken-chapter",
        "title: Broken Chapter",
        "slug: broken-chapter",
        "order: 1",
        "summary: bad:",
        "oops",
        "status: draft",
        "allowExecution: true",
        "createdAt: '2026-03-04T00:00:00.000Z'",
        "updatedAt: '2026-03-04T00:00:00.000Z'",
        "---",
        "# Broken",
      ].join("\n"),
      "utf8",
    );

    await expect(
      service.reorderBookChapters("reorder-broken-chapter", {
        chapterSlugs: ["healthy-chapter", "broken-chapter"],
      }),
    ).resolves.toBeNull();

    const chapterFiles = await fs.readdir(
      path.join(process.cwd(), tempRoot, "books", "reorder-broken-chapter", "chapters"),
    );
    expect(chapterFiles).toEqual(["001-healthy-chapter.md", "002-broken-chapter.md"]);
    await expect(
      fs.readFile(
        path.join(
          process.cwd(),
          tempRoot,
          "books",
          "reorder-broken-chapter",
          "chapters",
          "002-broken-chapter.md",
        ),
        "utf8",
      ),
    ).resolves.toContain("order: 2");
  });

  it("deletes books and notes while keeping collection order contiguous", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Alpha Book",
      slug: "alpha-book",
      description: "Delete me",
      body: "# Alpha Book",
      status: "draft",
      theme: "paper",
    });

    await service.createBook({
      title: "Beta Book",
      slug: "beta-book",
      description: "Keep me",
      body: "# Beta Book",
      status: "draft",
      theme: "paper",
    });

    await service.createNote({
      title: "Alpha Note",
      slug: "alpha-note",
      summary: "Delete me",
      body: "# Alpha Note",
      status: "draft",
      allowExecution: true,
    });

    await service.createNote({
      title: "Beta Note",
      slug: "beta-note",
      summary: "Keep me",
      body: "# Beta Note",
      status: "draft",
      allowExecution: true,
    });

    await service.deleteBook("alpha-book");
    await service.deleteNote("alpha-note");

    const tree = await service.getContentTree();

    expect(tree.books.some((book) => book.meta.slug === "alpha-book")).toBe(false);
    expect(tree.books.some((book) => book.meta.slug === "beta-book")).toBe(true);
    expect(tree.books.map((book) => book.meta.order)).toEqual(
      tree.books.map((_, index) => index + 1),
    );

    expect(tree.notes.some((note) => note.meta.slug === "alpha-note")).toBe(false);
    expect(tree.notes.some((note) => note.meta.slug === "beta-note")).toBe(true);
    await expect(
      fs.readFile(path.join(process.cwd(), tempRoot, "notes", "beta-note.md"), "utf8"),
    ).resolves.toContain("order: 2");

    await expect(service.getBook("alpha-book")).rejects.toThrow();
    await expect(service.getNote("alpha-note")).resolves.toBeNull();
    await expect(
      fs.access(path.join(process.cwd(), tempRoot, "books", "alpha-book")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(process.cwd(), tempRoot, "notes", "alpha-note.md")),
    ).rejects.toThrow();
  });

  it("creates, reorders, and deletes books even when one book file is malformed", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Broken Book",
      slug: "broken-book",
      description: "Broken",
      body: "# Broken",
      status: "draft",
      theme: "paper",
    });

    await service.createBook({
      title: "Healthy Book",
      slug: "healthy-book",
      description: "Healthy",
      body: "# Healthy",
      status: "draft",
      theme: "paper",
    });

    await fs.writeFile(
      path.join(process.cwd(), tempRoot, "books", "broken-book", "book.md"),
      [
        "---",
        "kind: book",
        "title: Broken Book",
        "slug: broken-book",
        "description: bad:",
        "oops",
        "order: 1",
        "status: draft",
        "featured: false",
        "coverColor: '#292118'",
        "fontPreset: source-serif",
        "createdAt: '2026-03-04T00:00:00.000Z'",
        "updatedAt: '2026-03-04T00:00:00.000Z'",
        "---",
        "# Broken",
      ].join("\n"),
      "utf8",
    );

    const created = await service.createBook({
      title: "Newest Book",
      slug: "newest-book",
      description: "Created beside malformed book",
      body: "# Newest Book",
      status: "draft",
      theme: "paper",
    });
    expect(created?.meta.order).toBe(4);

    await expect(
      service.reorderBooks({
        bookSlugs: ["healthy-book", "webbook-handbook", "broken-book", "newest-book"],
      }),
    ).resolves.toBeTruthy();

    await service.deleteBook("broken-book");

    await expect(
      fs.readFile(path.join(process.cwd(), tempRoot, "books", "healthy-book", "book.md"), "utf8"),
    ).resolves.toContain("order: 1");
    await expect(
      fs.readFile(path.join(process.cwd(), tempRoot, "books", "newest-book", "book.md"), "utf8"),
    ).resolves.toContain("order: 3");
  });

  it("creates, reorders, and deletes notes even when one note file is malformed", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createNote({
      title: "Broken Note",
      slug: "broken-note",
      summary: "Broken",
      body: "# Broken",
      status: "draft",
      allowExecution: true,
    });

    await service.createNote({
      title: "Healthy Note",
      slug: "healthy-note",
      summary: "Healthy",
      body: "# Healthy",
      status: "draft",
      allowExecution: true,
    });

    await fs.writeFile(
      path.join(process.cwd(), tempRoot, "notes", "broken-note.md"),
      [
        "---",
        "kind: note",
        "title: Broken Note",
        "slug: broken-note",
        "summary: bad:",
        "oops",
        "order: 1",
        "status: draft",
        "allowExecution: true",
        "fontPreset: source-serif",
        "createdAt: '2026-03-04T00:00:00.000Z'",
        "updatedAt: '2026-03-04T00:00:00.000Z'",
        "---",
        "# Broken",
      ].join("\n"),
      "utf8",
    );

    const created = await service.createNote({
      title: "Newest Note",
      slug: "newest-note",
      summary: "Created beside malformed note",
      body: "# Newest Note",
      status: "draft",
      allowExecution: true,
    });
    expect(created?.meta.order).toBe(4);

    await expect(
      service.reorderNotes({
        noteSlugs: ["healthy-note", "webbook-notes", "broken-note", "newest-note"],
      }),
    ).resolves.toBeTruthy();

    await service.deleteNote("broken-note");

    await expect(
      fs.readFile(path.join(process.cwd(), tempRoot, "notes", "healthy-note.md"), "utf8"),
    ).resolves.toContain("order: 1");
    await expect(
      fs.readFile(path.join(process.cwd(), tempRoot, "notes", "newest-note.md"), "utf8"),
    ).resolves.toContain("order: 3");
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

    const reorderedNoteSlugs = ["beta-note", "webbook-notes", "alpha-note"];

    await service.reorderNotes({
      noteSlugs: reorderedNoteSlugs,
    });

    const tree = await service.getContentTree();

    expect(tree.books.map((book) => book.meta.slug)).toEqual([
      "beta-book",
      "webbook-handbook",
      "alpha-book",
    ]);
    expect(tree.notes.map((note) => note.meta.slug)).toEqual(["beta-note", "alpha-note"]);
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
        title: "Zero Order",
        slug: "zero-order",
        summary: "",
        body: "# Zero Order",
        status: "draft",
        allowExecution: true,
        order: 0,
      }),
    ).rejects.toThrow();

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
