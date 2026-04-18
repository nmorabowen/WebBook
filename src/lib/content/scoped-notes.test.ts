import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-scoped-notes-test";

async function loadService() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./service");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), { recursive: true, force: true });
});

function buildNoteBody(slug: string, title: string) {
  return `---
kind: note
id: note-${slug}
title: ${title}
slug: ${slug}
createdAt: "2026-04-18T00:00:00.000Z"
updatedAt: "2026-04-18T00:00:00.000Z"
routeAliases: []
status: draft
allowExecution: true
---
body
`;
}

async function writeNote(absDir: string, slug: string, title: string) {
  await fs.mkdir(absDir, { recursive: true });
  await fs.writeFile(path.join(absDir, `${slug}.md`), buildNoteBody(slug, title));
}

describe("Slice K: scoped note storage", () => {
  it("stamps location: { kind: 'root' } on legacy notes/<slug>.md files", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    await writeNote(
      path.join(process.cwd(), tempRoot, "notes"),
      "legacy",
      "Legacy",
    );

    const tree = await service.getContentTree();
    const note = tree.notes.find((n) => n.meta.slug === "legacy");
    expect(note).toBeDefined();
    expect(note!.location).toEqual({ kind: "root" });
    expect(note!.route).toBe("/notes/legacy");
  });

  it("discovers a book-scoped note under <book>/notes/ with the right route", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();
    await service.createBook({
      title: "Host",
      slug: "host",
      description: "",
      body: "# Host",
      status: "draft",
      theme: "paper",
    });

    await writeNote(
      path.join(process.cwd(), tempRoot, "books", "host", "notes"),
      "research",
      "Research",
    );

    const tree = await service.getContentTree();
    const note = tree.notes.find((n) => n.meta.slug === "research");
    expect(note, "scoped note should appear in tree.notes").toBeDefined();
    expect(note!.location).toEqual({ kind: "book", bookSlug: "host" });
    expect(note!.route).toBe("/books/host/notes/research");
  });

  it("discovers a chapter-scoped note under <chapter-folder>/notes/", async () => {
    const service = await loadService();
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

    // Chapter folder mirrors the chapter file: 001-intro.md alongside 001-intro/
    await writeNote(
      path.join(process.cwd(), tempRoot, "books", "host", "chapters", "001-intro", "notes"),
      "sketch",
      "Sketch",
    );

    const tree = await service.getContentTree();
    const note = tree.notes.find((n) => n.meta.slug === "sketch");
    expect(note).toBeDefined();
    expect(note!.location).toEqual({
      kind: "chapter",
      bookSlug: "host",
      chapterPath: ["intro"],
    });
    expect(note!.route).toBe("/books/host/chapters/intro/notes/sketch");
  });

  it("returns scoped + root notes together in a single tree.notes array", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();
    await service.createBook({
      title: "Host",
      slug: "host",
      description: "",
      body: "# Host",
      status: "draft",
      theme: "paper",
    });

    await writeNote(path.join(process.cwd(), tempRoot, "notes"), "alpha", "Alpha");
    await writeNote(
      path.join(process.cwd(), tempRoot, "books", "host", "notes"),
      "beta",
      "Beta",
    );

    const tree = await service.getContentTree();
    const slugs = tree.notes.map((n) => n.meta.slug);
    expect(slugs).toEqual(expect.arrayContaining(["alpha", "beta"]));
    const byLocation = Object.fromEntries(
      tree.notes.map((n) => [n.meta.slug, n.location.kind]),
    );
    expect(byLocation.alpha).toBe("root");
    expect(byLocation.beta).toBe("book");
  });
});
