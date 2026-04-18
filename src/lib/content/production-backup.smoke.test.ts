/**
 * Optional smoke test: exercises the Phase-2 resolver against an actual
 * production workspace export.
 *
 * The test reads a zip placed at `<repo>/backup/*.zip`, extracts it into a
 * temp content root, and verifies the new resolveContentRef can find every
 * book and note that the loaded ContentTree advertises. If no zip is
 * present (e.g. on CI), the suite is silently skipped — `it.skipIf` keeps
 * the test as a developer convenience without forcing a fixture into git.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs, existsSync } from "fs";
import path from "path";
import JSZip from "jszip";

const repoRoot = process.cwd();
const backupDir = path.join(repoRoot, "backup");
const tempRoot = ".tmp-prod-backup-test";

function findBackupZip(): string | null {
  if (!existsSync(backupDir)) return null;
  const files = require("fs")
    .readdirSync(backupDir)
    .filter((f: string) => f.startsWith("webbook-workspace-") && f.endsWith(".zip"))
    .sort();
  return files.length ? path.join(backupDir, files[files.length - 1]) : null;
}

async function extractBackupTo(targetRoot: string, zipPath: string) {
  const buffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buffer);
  await fs.mkdir(targetRoot, { recursive: true });
  const entries = Object.entries(zip.files);
  for (const [name, entry] of entries) {
    if (entry.dir) continue;
    if (!name.startsWith("content/")) continue;
    const rel = name.slice("content/".length);
    if (!rel) continue;
    const dest = path.join(targetRoot, rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const content = await entry.async("nodebuffer");
    await fs.writeFile(dest, content);
  }
}

const zipPath = findBackupZip();
const skip = !zipPath;

describe.skipIf(skip)("Slice J resolver against production backup", () => {
  afterEach(async () => {
    delete process.env.CONTENT_ROOT;
    await fs.rm(path.join(repoRoot, tempRoot), { recursive: true, force: true });
  });

  it("resolves every book and note advertised by the workspace tree", async () => {
    expect(zipPath).not.toBeNull();
    const targetRoot = path.join(repoRoot, tempRoot);
    await extractBackupTo(targetRoot, zipPath!);

    process.env.CONTENT_ROOT = tempRoot;
    vi.resetModules();
    const service = await import("./service");
    await service.ensureContentScaffold();

    const tree = await service.getContentTree();
    expect(tree.books.length).toBeGreaterThan(0);
    expect(tree.notes.length).toBeGreaterThanOrEqual(0);

    // Every book advertised by the tree must be resolvable by ContentRef.
    for (const book of tree.books) {
      const resolved = await service.resolveContentRef({
        kind: "book",
        bookSlug: book.meta.slug,
      });
      expect(resolved, `book ${book.meta.slug} should resolve`).not.toBeNull();
      expect(resolved!.kind).toBe("book");
    }

    // Same for notes.
    for (const note of tree.notes) {
      const resolved = await service.resolveContentRef({
        kind: "note",
        slug: note.meta.slug,
      });
      expect(resolved, `note ${note.meta.slug} should resolve`).not.toBeNull();
      expect(resolved!.kind).toBe("note");
    }

    // And at least one chapter from the first book that has any.
    const bookWithChapters = tree.books.find((b) => b.chapters.length > 0);
    if (bookWithChapters) {
      const chapter = bookWithChapters.chapters[0];
      const resolved = await service.resolveContentRef({
        kind: "chapter",
        bookSlug: bookWithChapters.meta.slug,
        chapterPath: chapter.path,
      });
      expect(resolved).not.toBeNull();
      expect(resolved!.kind).toBe("chapter");
    }
  });
});
