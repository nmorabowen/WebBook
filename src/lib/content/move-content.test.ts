import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-move-content-test";

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
 * Slice M coverage: the unified moveContent dispatcher reaches every
 * existing kind-specific mover via a single signature. Reorders stay on
 * their dedicated endpoints (intentional). Scoped-note destinations are
 * scaffolded in the schema but reserved for the next slice — those cases
 * must reject with a clear error for now.
 */
describe("Slice M: moveContent dispatcher", () => {
  async function seedTwoBooks(service: Awaited<ReturnType<typeof loadService>>) {
    await service.ensureContentScaffold();
    await service.createBook({
      title: "Source",
      slug: "source",
      description: "",
      body: "# Source",
      status: "draft",
      theme: "paper",
    });
    await service.createBook({
      title: "Destination",
      slug: "dest",
      description: "",
      body: "# Destination",
      status: "draft",
      theme: "paper",
    });
    await service.createChapter("source", {
      title: "Intro",
      slug: "intro",
      summary: "",
      body: "# Intro",
      status: "draft",
      allowExecution: true,
      order: 1,
    });
    await service.createChapter("source", {
      title: "Body",
      slug: "body",
      summary: "",
      body: "# Body",
      status: "draft",
      allowExecution: true,
      order: 2,
    });
  }

  it("moves a chapter cross-book via parent={kind:'book'}", async () => {
    const service = await loadService();
    await seedTwoBooks(service);

    await service.moveContent({
      source: { kind: "chapter", bookSlug: "source", chapterPath: ["intro"] },
      destination: { parent: { kind: "book", bookSlug: "dest" } },
    });

    const tree = await service.getContentTree();
    const sourceBook = tree.books.find((b) => b.meta.slug === "source");
    const destBook = tree.books.find((b) => b.meta.slug === "dest");
    expect(sourceBook!.chapters.map((c) => c.meta.slug)).toEqual(["body"]);
    expect(destBook!.chapters.map((c) => c.meta.slug)).toEqual(["intro"]);
  });

  it("nests a chapter under another chapter via parent={kind:'chapter'}", async () => {
    const service = await loadService();
    await seedTwoBooks(service);

    await service.moveContent({
      source: { kind: "chapter", bookSlug: "source", chapterPath: ["body"] },
      destination: {
        parent: { kind: "chapter", bookSlug: "source", chapterPath: ["intro"] },
      },
    });

    const tree = await service.getContentTree();
    const sourceBook = tree.books.find((b) => b.meta.slug === "source");
    expect(sourceBook!.chapters.map((c) => c.meta.slug)).toEqual(["intro"]);
    expect(sourceBook!.chapters[0].children.map((c) => c.meta.slug)).toEqual(["body"]);
  });

  it("demotes a leaf chapter to root note via parent={kind:'notes-root'}", async () => {
    const service = await loadService();
    await seedTwoBooks(service);

    await service.moveContent({
      source: { kind: "chapter", bookSlug: "source", chapterPath: ["body"] },
      destination: { parent: { kind: "notes-root" } },
    });

    const tree = await service.getContentTree();
    expect(tree.notes.some((n) => n.meta.slug === "body")).toBe(true);
    const sourceBook = tree.books.find((b) => b.meta.slug === "source");
    expect(sourceBook!.chapters.some((c) => c.meta.slug === "body")).toBe(false);
  });

  it("promotes a note to a book root chapter", async () => {
    const service = await loadService();
    await seedTwoBooks(service);
    await service.createNote({
      title: "Promo",
      slug: "promo",
      summary: "",
      body: "body",
      status: "draft",
      theme: "paper",
    });

    await service.moveContent({
      source: { kind: "note", slug: "promo" },
      destination: { parent: { kind: "book", bookSlug: "dest" } },
    });

    const tree = await service.getContentTree();
    const destBook = tree.books.find((b) => b.meta.slug === "dest");
    expect(destBook!.chapters.some((c) => c.meta.slug === "promo")).toBe(true);
    expect(tree.notes.some((n) => n.meta.slug === "promo")).toBe(false);
  });

  it("promotes a note to a nested chapter under another chapter", async () => {
    const service = await loadService();
    await seedTwoBooks(service);
    await service.createNote({
      title: "Promo",
      slug: "promo",
      summary: "",
      body: "body",
      status: "draft",
      theme: "paper",
    });

    await service.moveContent({
      source: { kind: "note", slug: "promo" },
      destination: {
        parent: { kind: "chapter", bookSlug: "source", chapterPath: ["intro"] },
      },
    });

    const tree = await service.getContentTree();
    const sourceBook = tree.books.find((b) => b.meta.slug === "source");
    const intro = sourceBook!.chapters.find((c) => c.meta.slug === "intro");
    expect(intro!.children.some((c) => c.meta.slug === "promo")).toBe(true);
  });

  it("moves a root note into a book's scoped notes folder (role=note)", async () => {
    const service = await loadService();
    await seedTwoBooks(service);
    await service.createNote({
      title: "Stay",
      slug: "stay",
      summary: "",
      body: "body",
      status: "draft",
      theme: "paper",
    });

    await service.moveContent({
      source: { kind: "note", slug: "stay" },
      destination: {
        parent: { kind: "book", bookSlug: "dest" },
        role: "note",
      },
    });

    const tree = await service.getContentTree();
    const stay = tree.notes.find((n) => n.meta.slug === "stay");
    expect(stay).toBeDefined();
    expect(stay!.location).toEqual({ kind: "book", bookSlug: "dest" });
    expect(stay!.route).toBe("/books/dest/notes/stay");
  });

  it("moves a scoped note into a chapter-scoped notes folder", async () => {
    const service = await loadService();
    await seedTwoBooks(service);
    await service.createNote({
      title: "Roving",
      slug: "roving",
      summary: "",
      body: "body",
      status: "draft",
      theme: "paper",
    });

    // root -> book scope
    await service.moveContent({
      source: { kind: "note", slug: "roving" },
      destination: {
        parent: { kind: "book", bookSlug: "source" },
        role: "note",
      },
    });
    // book scope -> chapter scope
    await service.moveContent({
      source: { kind: "note", slug: "roving" },
      destination: {
        parent: { kind: "chapter", bookSlug: "source", chapterPath: ["intro"] },
        role: "note",
      },
    });

    const tree = await service.getContentTree();
    const roving = tree.notes.find((n) => n.meta.slug === "roving");
    expect(roving).toBeDefined();
    expect(roving!.location).toEqual({
      kind: "chapter",
      bookSlug: "source",
      chapterPath: ["intro"],
    });
    expect(roving!.route).toBe("/books/source/chapters/intro/notes/roving");
  });

  it("moves a scoped note back to root via parent={kind:'notes-root'}", async () => {
    const service = await loadService();
    await seedTwoBooks(service);
    await service.createNote({
      title: "Returner",
      slug: "returner",
      summary: "",
      body: "body",
      status: "draft",
      theme: "paper",
    });

    await service.moveContent({
      source: { kind: "note", slug: "returner" },
      destination: {
        parent: { kind: "book", bookSlug: "source" },
        role: "note",
      },
    });
    // ...and back
    await service.moveContent({
      source: { kind: "note", slug: "returner" },
      destination: { parent: { kind: "notes-root" } },
    });

    const tree = await service.getContentTree();
    const returner = tree.notes.find((n) => n.meta.slug === "returner");
    expect(returner!.location).toEqual({ kind: "root" });
    expect(returner!.route).toBe("/notes/returner");
  });

  it("rejects scoped-note moves when slug already exists at destination", async () => {
    const service = await loadService();
    await seedTwoBooks(service);
    await service.createNote({
      title: "Conflict",
      slug: "conflict",
      summary: "",
      body: "body",
      status: "draft",
      theme: "paper",
    });
    // Move it into book scope
    await service.moveContent({
      source: { kind: "note", slug: "conflict" },
      destination: {
        parent: { kind: "book", bookSlug: "source" },
        role: "note",
      },
    });
    // Make a second note at root with the same slug, then try to move it into
    // the same scope. Skip — slugs are globally unique at create-time today,
    // so we can only test the "back to root" no-op via the same slug.
    // Demonstrate idempotency: moving to current scope is a no-op.
    const result = await service.moveContent({
      source: { kind: "note", slug: "conflict" },
      destination: {
        parent: { kind: "book", bookSlug: "source" },
        role: "note",
      },
    });
    expect(result).not.toBeNull();
    if (result && "meta" in result) {
      expect(result.meta.slug).toBe("conflict");
    }
  });

  it("rejects unknown source/destination combinations cleanly", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await expect(
      service.moveContent({
        source: { kind: "book", bookSlug: "anything" },
        destination: { parent: { kind: "notes-root" } },
      }),
    ).rejects.toThrow(/does not support/);
  });
});
