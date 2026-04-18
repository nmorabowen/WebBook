import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-unified-content-test";

async function loadService() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./service");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), { recursive: true, force: true });
});

/**
 * Slice L coverage: a single ContentRef-shaped read + delete entry point.
 * These tests pin the dispatch contract (book/chapter/note all reachable
 * through the same call) so subsequent slices can collapse the kind-specific
 * routes without re-deriving the semantics from scratch.
 */
describe("Slice L: unified getContent + deleteContent", () => {
  async function seed(service: Awaited<ReturnType<typeof loadService>>) {
    await service.ensureContentScaffold();
    await service.createBook({
      title: "Sample",
      slug: "sample",
      description: "",
      body: "# Sample",
      status: "draft",
      theme: "paper",
    });
    await service.createChapter("sample", {
      title: "Intro",
      slug: "intro",
      summary: "",
      body: "# Intro",
      status: "draft",
      allowExecution: true,
      order: 1,
    });
    await service.createNote({
      title: "Scratch",
      slug: "scratch",
      summary: "",
      body: "scratch body",
      status: "draft",
      theme: "paper",
    });
  }

  it("getContent returns each record kind by ref", async () => {
    const service = await loadService();
    await seed(service);

    const book = await service.getContent({ kind: "book", bookSlug: "sample" });
    expect(book).not.toBeNull();
    const bookRecord = book!;
    expect(bookRecord.kind).toBe("book");
    if (bookRecord.kind === "book") expect(bookRecord.meta.slug).toBe("sample");

    const chapter = await service.getContent({
      kind: "chapter",
      bookSlug: "sample",
      chapterPath: ["intro"],
    });
    expect(chapter).not.toBeNull();
    const chapterRecord = chapter!;
    expect(chapterRecord.kind).toBe("chapter");
    if (chapterRecord.kind === "chapter") expect(chapterRecord.meta.slug).toBe("intro");

    const note = await service.getContent({ kind: "note", slug: "scratch" });
    expect(note).not.toBeNull();
    const noteRecord = note!;
    expect(noteRecord.kind).toBe("note");
    if (noteRecord.kind === "note") expect(noteRecord.meta.slug).toBe("scratch");
  });

  it("getContent returns null for unknown refs", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    expect(await service.getContent({ kind: "book", bookSlug: "nope" })).toBeNull();
    expect(await service.getContent({ kind: "note", slug: "nope" })).toBeNull();
    expect(
      await service.getContent({
        kind: "chapter",
        bookSlug: "nope",
        chapterPath: ["nope"],
      }),
    ).toBeNull();
  });

  it("deleteContent removes a chapter and getContent then returns null", async () => {
    const service = await loadService();
    await seed(service);

    await service.deleteContent({
      kind: "chapter",
      bookSlug: "sample",
      chapterPath: ["intro"],
    });

    const after = await service.getContent({
      kind: "chapter",
      bookSlug: "sample",
      chapterPath: ["intro"],
    });
    expect(after).toBeNull();
  });

  it("deleteContent removes a note and getContent then returns null", async () => {
    const service = await loadService();
    await seed(service);

    await service.deleteContent({ kind: "note", slug: "scratch" });

    const after = await service.getContent({ kind: "note", slug: "scratch" });
    expect(after).toBeNull();
  });

  it("deleteContent removes a book and getContent then returns null", async () => {
    const service = await loadService();
    await seed(service);

    await service.deleteContent({ kind: "book", bookSlug: "sample" });

    const after = await service.getContent({ kind: "book", bookSlug: "sample" });
    expect(after).toBeNull();
  });
});
