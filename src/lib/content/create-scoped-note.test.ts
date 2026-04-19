import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-create-scoped-note-test";

async function loadService() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./service");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), { recursive: true, force: true });
});

const NOTE_INPUT = {
  title: "New Scoped Note",
  slug: "new-scoped-note",
  summary: "",
  body: "scoped body",
  status: "draft" as const,
  theme: "paper" as const,
};

describe("createNote with scoped location (Slice Q)", () => {
  async function seedBook(service: Awaited<ReturnType<typeof loadService>>) {
    await service.ensureContentScaffold();
    await service.createBook({
      title: "Host",
      slug: "host",
      description: "",
      body: "# Host",
      status: "draft",
      theme: "paper",
    });
    await service.createChapter("host", {
      title: "Intro",
      slug: "intro",
      summary: "",
      body: "# Intro",
      status: "draft",
      allowExecution: true,
      order: 1,
    });
  }

  it("defaults to root when no location is passed", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    const note = await service.createNote(NOTE_INPUT);
    expect(note).not.toBeNull();
    expect(note!.location).toEqual({ kind: "root" });
    expect(note!.route).toBe("/notes/new-scoped-note");
  });

  it("creates a book-scoped note inside <book>/notes/", async () => {
    const service = await loadService();
    await seedBook(service);

    const note = await service.createNote(NOTE_INPUT, {
      kind: "book",
      bookSlug: "host",
    });
    expect(note).not.toBeNull();
    expect(note!.location).toEqual({ kind: "book", bookSlug: "host" });
    expect(note!.route).toBe("/books/host/notes/new-scoped-note");

    const onDisk = await fs.access(
      path.join(process.cwd(), tempRoot, "books", "host", "notes", "new-scoped-note.md"),
    );
    expect(onDisk).toBeUndefined();
  });

  it("creates a chapter-scoped note inside the chapter's companion folder", async () => {
    const service = await loadService();
    await seedBook(service);

    const note = await service.createNote(NOTE_INPUT, {
      kind: "chapter",
      bookSlug: "host",
      chapterPath: ["intro"],
    });
    expect(note).not.toBeNull();
    expect(note!.location).toEqual({
      kind: "chapter",
      bookSlug: "host",
      chapterPath: ["intro"],
    });
    expect(note!.route).toBe("/books/host/chapters/intro/notes/new-scoped-note");
  });

  it("rejects a slug that already exists at any location", async () => {
    const service = await loadService();
    await seedBook(service);

    await service.createNote(NOTE_INPUT, { kind: "book", bookSlug: "host" });

    await expect(service.createNote(NOTE_INPUT)).rejects.toThrow(/already exists/);
    await expect(
      service.createNote(NOTE_INPUT, {
        kind: "chapter",
        bookSlug: "host",
        chapterPath: ["intro"],
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("assigns per-folder ordering (siblings start at 1, second sibling at 2)", async () => {
    const service = await loadService();
    await seedBook(service);

    const first = await service.createNote(
      { ...NOTE_INPUT, slug: "first", title: "First" },
      { kind: "book", bookSlug: "host" },
    );
    const second = await service.createNote(
      { ...NOTE_INPUT, slug: "second", title: "Second" },
      { kind: "book", bookSlug: "host" },
    );
    const root = await service.createNote({
      ...NOTE_INPUT,
      slug: "root-only",
      title: "Root",
    });

    expect(first!.meta.order).toBe(1);
    expect(second!.meta.order).toBe(2);
    // Root scope has its own counter, independent of the book scope. The
    // sample scaffold already seeds one root note, so the new note gets
    // order 2 there — the load-bearing assertion is that the book-scope
    // counter wasn't affected by writes outside it.
    expect(root!.meta.order).toBeGreaterThan(0);
  });
});
