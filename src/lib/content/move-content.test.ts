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

  it("rejects scoped-note destinations until Slice N", async () => {
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

    await expect(
      service.moveContent({
        source: { kind: "note", slug: "stay" },
        destination: {
          parent: { kind: "book", bookSlug: "dest" },
          role: "note",
        },
      }),
    ).rejects.toThrow(/scoped notes folder is not yet supported/);
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
