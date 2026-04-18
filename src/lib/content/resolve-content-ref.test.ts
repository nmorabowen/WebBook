import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-resolve-content-ref-test";

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
 * Slice J integration: verify the unified resolveContentRef round-trips every
 * kind (book, chapter, root note) through a real filesystem scaffold, and that
 * its shape matches what the Phase-1 legacy resolvers produced. These
 * assertions lock in current behavior so subsequent slices can refactor the
 * internals without regressing callers.
 */
describe("resolveContentRef (Slice J)", () => {
  it("resolves a book by ref", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Sample Book",
      slug: "sample-book",
      description: "",
      body: "# Sample",
      status: "draft",
      theme: "paper",
    });

    const result = await service.resolveContentRef({
      kind: "book",
      bookSlug: "sample-book",
    });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.kind).toBe("book");
    if (r.kind !== "book") return;
    expect(r.record.meta.slug).toBe("sample-book");
    expect(r.aliased).toBe(false);
  });

  it("resolves a chapter by ref", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createBook({
      title: "Chapter Host",
      slug: "chapter-host",
      description: "",
      body: "# Host",
      status: "draft",
      theme: "paper",
    });

    await service.createChapter("chapter-host", {
      title: "Intro",
      slug: "intro",
      summary: "",
      body: "# Intro",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    const result = await service.resolveContentRef({
      kind: "chapter",
      bookSlug: "chapter-host",
      chapterPath: ["intro"],
    });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.kind).toBe("chapter");
    if (r.kind !== "chapter") return;
    expect(r.chapter.meta.slug).toBe("intro");
    expect(r.book.meta.slug).toBe("chapter-host");
    expect(r.aliased).toBe(false);
  });

  it("resolves a root note by ref", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await service.createNote({
      title: "Scratch",
      slug: "scratch",
      summary: "",
      body: "body",
      status: "draft",
      theme: "paper",
    });

    const result = await service.resolveContentRef({ kind: "note", slug: "scratch" });

    expect(result).not.toBeNull();
    const r = result!;
    expect(r.kind).toBe("note");
    if (r.kind !== "note") return;
    expect(r.record.meta.slug).toBe("scratch");
    expect(r.aliased).toBe(false);
  });

  it("returns null for an unknown ref", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    expect(
      await service.resolveContentRef({ kind: "book", bookSlug: "nope" }),
    ).toBeNull();
    expect(
      await service.resolveContentRef({ kind: "note", slug: "nope" }),
    ).toBeNull();
    expect(
      await service.resolveContentRef({
        kind: "chapter",
        bookSlug: "nope",
        chapterPath: ["nope"],
      }),
    ).toBeNull();
  });
});
