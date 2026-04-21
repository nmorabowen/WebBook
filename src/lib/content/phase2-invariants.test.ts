/**
 * Phase-2 invariant integration test.
 *
 * One end-to-end exercise that seeds a non-trivial content tree, performs
 * every supported mutation through the unified Phase-2 surfaces, and
 * re-validates the content invariants after each step. This is the
 * "would have caught the bugs we shipped" test: every regression we
 * have hit while live-testing scoped notes is asserted here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-phase2-invariants-test";

async function loadService() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./service");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), { recursive: true, force: true });
});

type Service = Awaited<ReturnType<typeof loadService>>;

async function assertNoOrphanStaging(repoRoot: string) {
  const booksRoot = path.join(repoRoot, "books");
  const walk = async (dir: string): Promise<string[]> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith(".chapters-")) {
        found.push(full);
        continue;
      }
      if (entry.name.startsWith(".")) continue;
      found.push(...(await walk(full)));
    }
    return found;
  };
  const orphans = await walk(booksRoot);
  expect(orphans, `orphan staging dirs: ${orphans.join(", ")}`).toEqual([]);
}

/**
 * Single source of truth on what "the tree is healthy" means. Re-run
 * after every mutation in the test below; if an invariant breaks, the
 * specific assertion fires and we know exactly which property regressed.
 */
async function assertHealthy(service: Service, contentRoot: string) {
  // 1. The service-layer guard must accept the tree.
  const tree = await service.getContentTree();
  expect(tree).toBeDefined();

  // 2. Every record's id is globally unique.
  const ids = new Set<string>();
  const dupes: string[] = [];
  const collect = (id: string, label: string) => {
    if (ids.has(id)) dupes.push(`${id} (${label})`);
    ids.add(id);
  };
  for (const book of tree.books) {
    collect(book.meta.id, `book ${book.meta.slug}`);
    const visit = (chapters: typeof book.chapters) => {
      for (const chap of chapters) {
        collect(chap.meta.id, `chapter ${book.meta.slug}/${chap.path.join("/")}`);
        visit(chap.children);
      }
    };
    visit(book.chapters);
  }
  for (const note of tree.notes) {
    collect(note.meta.id, `note ${note.meta.slug} (${note.location.kind})`);
  }
  expect(dupes, `duplicate ids in tree: ${dupes.join(", ")}`).toEqual([]);

  // 3. Every advertised note route is unique (URL-level uniqueness).
  const routes = new Set<string>();
  const routeDupes: string[] = [];
  for (const note of tree.notes) {
    if (routes.has(note.route)) routeDupes.push(note.route);
    routes.add(note.route);
  }
  expect(routeDupes, `duplicate note routes: ${routeDupes.join(", ")}`).toEqual(
    [],
  );

  // 4. Every note's location is internally consistent with its route.
  for (const note of tree.notes) {
    if (note.location.kind === "root") {
      expect(note.route).toBe(`/notes/${note.meta.slug}`);
    } else if (note.location.kind === "book") {
      expect(note.route).toBe(
        `/books/${note.location.bookSlug}/notes/${note.meta.slug}`,
      );
    } else {
      expect(note.route).toBe(
        `/books/${note.location.bookSlug}/chapters/${note.location.chapterPath.join("/")}/notes/${note.meta.slug}`,
      );
    }
  }

  // 5. resolveContentRef agrees with the tree for every book and chapter.
  for (const book of tree.books) {
    const r = await service.resolveContentRef({
      kind: "book",
      bookSlug: book.meta.slug,
    });
    expect(r, `resolveContentRef missing for book ${book.meta.slug}`).not.toBeNull();
  }

  // 6. getNoteAtLocation reaches every note via its (slug, location) pair.
  for (const note of tree.notes) {
    const found = await service.getNoteAtLocation(
      note.meta.slug,
      note.location,
    );
    expect(
      found,
      `getNoteAtLocation lost ${note.meta.slug} at ${note.location.kind}`,
    ).not.toBeNull();
    expect(found!.meta.id).toBe(note.meta.id);
  }

  // 7. No orphan staging directories left behind by interrupted moves.
  await assertNoOrphanStaging(contentRoot);
}

describe("Phase-2 invariants under the full mutation surface", () => {
  let contentRoot: string;

  beforeEach(() => {
    contentRoot = path.join(process.cwd(), tempRoot);
  });

  it("survives create / move / promote / demote / delete with no corruption", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    // ── Seed two books with two chapters each ────────────────────
    await service.createBook({
      title: "Alpha",
      slug: "alpha",
      description: "",
      body: "# Alpha",
      status: "draft",
      theme: "paper",
    });
    await service.createBook({
      title: "Bravo",
      slug: "bravo",
      description: "",
      body: "# Bravo",
      status: "draft",
      theme: "paper",
    });
    await service.createChapter("alpha", {
      title: "Intro",
      slug: "intro",
      summary: "",
      body: "# Intro",
      status: "draft",
      allowExecution: true,
      order: 1,
    });
    await service.createChapter("alpha", {
      title: "Body",
      slug: "body",
      summary: "",
      body: "# Body",
      status: "draft",
      allowExecution: true,
      order: 2,
    });
    await service.createChapter("bravo", {
      title: "First",
      slug: "first",
      summary: "",
      body: "# First",
      status: "draft",
      allowExecution: true,
      order: 1,
    });

    // ── Notes with deliberate cross-folder slug collisions ───────
    // Root + book-scoped + chapter-scoped, two named "shared".
    await service.createNote({
      title: "Shared",
      slug: "shared",
      summary: "",
      body: "root shared",
      status: "draft",
      theme: "paper",
    });
    await service.createNote(
      {
        title: "Shared",
        slug: "shared",
        summary: "",
        body: "alpha-scoped shared",
        status: "draft",
        theme: "paper",
      },
      { kind: "book", bookSlug: "alpha" },
    );
    await service.createNote(
      {
        title: "Shared",
        slug: "shared",
        summary: "",
        body: "bravo-first-scoped shared",
        status: "draft",
        theme: "paper",
      },
      { kind: "chapter", bookSlug: "bravo", chapterPath: ["first"] },
    );

    // Sanity baseline.
    await assertHealthy(service, contentRoot);

    // ── Same-slug notes resolve to the right record by location ──
    const bookScoped = await service.getNoteAtLocation("shared", {
      kind: "book",
      bookSlug: "alpha",
    });
    expect(bookScoped).not.toBeNull();
    expect(bookScoped!.body).toBe("alpha-scoped shared");

    const chapterScoped = await service.getNoteAtLocation("shared", {
      kind: "chapter",
      bookSlug: "bravo",
      chapterPath: ["first"],
    });
    expect(chapterScoped).not.toBeNull();
    expect(chapterScoped!.body).toBe("bravo-first-scoped shared");

    // ── Promote a chapter-scoped note in the SAME book ──────────
    // (this is the orphan-leaving path we just patched in 21dc6d9)
    await service.createNote(
      {
        title: "ToPromote",
        slug: "to-promote",
        summary: "",
        body: "promote me",
        status: "draft",
        theme: "paper",
      },
      { kind: "chapter", bookSlug: "alpha", chapterPath: ["intro"] },
    );
    await assertHealthy(service, contentRoot);

    await service.moveContent({
      source: { kind: "note", slug: "to-promote" },
      destination: { parent: { kind: "book", bookSlug: "alpha" } },
    });
    await assertHealthy(service, contentRoot);

    // The chapter exists, the source note does not.
    const treeAfterPromote = await service.getContentTree();
    const alpha = treeAfterPromote.books.find((b) => b.meta.slug === "alpha")!;
    expect(alpha.chapters.some((c) => c.meta.slug === "to-promote")).toBe(true);
    expect(
      treeAfterPromote.notes.some((n) => n.meta.slug === "to-promote"),
    ).toBe(false);

    // ── Demote a leaf chapter back to a root note ──────────────
    await service.moveContent({
      source: { kind: "chapter", bookSlug: "alpha", chapterPath: ["body"] },
      destination: { parent: { kind: "notes-root" } },
    });
    await assertHealthy(service, contentRoot);

    // ── Move a root note into a book-scoped notes folder ────────
    await service.createNote({
      title: "Drifter",
      slug: "drifter",
      summary: "",
      body: "drifting",
      status: "draft",
      theme: "paper",
    });
    await service.moveContent({
      source: { kind: "note", slug: "drifter" },
      destination: {
        parent: { kind: "book", bookSlug: "bravo" },
        role: "note",
      },
    });
    await assertHealthy(service, contentRoot);

    // ── Move that note again into a chapter-scoped folder ───────
    await service.moveContent({
      source: { kind: "note", slug: "drifter" },
      destination: {
        parent: { kind: "chapter", bookSlug: "bravo", chapterPath: ["first"] },
        role: "note",
      },
    });
    await assertHealthy(service, contentRoot);

    // ── And back to root ────────────────────────────────────────
    await service.moveContent({
      source: { kind: "note", slug: "drifter" },
      destination: { parent: { kind: "notes-root" } },
    });
    await assertHealthy(service, contentRoot);

    // ── Delete one of each kind via deleteContent ───────────────
    await service.deleteContent({ kind: "note", slug: "drifter" });
    await assertHealthy(service, contentRoot);

    await service.deleteContent({
      kind: "chapter",
      bookSlug: "alpha",
      chapterPath: ["intro"],
    });
    await assertHealthy(service, contentRoot);

    // Final state: invariants still hold and the books / notes that
    // should have survived are still present.
    const final = await service.getContentTree();
    const survivingNoteSlugs = final.notes.map((n) => n.meta.slug);
    expect(survivingNoteSlugs).toContain("shared");
    expect(survivingNoteSlugs).toContain("body"); // demoted chapter became a root note
  });

  it("rebuildIndexes throws a clear error when two records share an id", async () => {
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
    await service.createNote({
      title: "Twin",
      slug: "twin",
      summary: "",
      body: "twin",
      status: "draft",
      theme: "paper",
    });

    // Plant a deliberate corruption: copy the root twin note into the
    // book's scoped notes folder so two files share the same id field.
    const sourcePath = path.join(contentRoot, "notes", "twin.md");
    const targetDir = path.join(contentRoot, "books", "host", "notes");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(sourcePath, path.join(targetDir, "twin.md"));

    // Error must include both file paths so the operator can reconcile.
    await expect(service.rebuildIndexes()).rejects.toThrow(/Duplicate id/);
    await expect(service.rebuildIndexes()).rejects.toThrow(/notes[\\/]twin\.md/);
    await expect(service.rebuildIndexes()).rejects.toThrow(
      /books[\\/]host[\\/]notes[\\/]twin\.md/,
    );
  });
});
