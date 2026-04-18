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

let tempRootCounter = 0;
function nextTempRoot(): string {
  tempRootCounter += 1;
  return `.tmp-prod-backup-${process.pid}-${Date.now()}-${tempRootCounter}`;
}

async function safeRm(target: string) {
  // Windows occasionally returns EBUSY/ENOTEMPTY when a recently-loaded
  // module still holds a file handle. Retry once after a short delay.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

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
  let tempRoot = "";
  let targetRoot = "";

  afterEach(async () => {
    delete process.env.CONTENT_ROOT;
    if (targetRoot) await safeRm(targetRoot);
  });

  it("resolves every book and note advertised by the workspace tree", { timeout: 30000 }, async () => {
    expect(zipPath).not.toBeNull();
    tempRoot = nextTempRoot();
    targetRoot = path.join(repoRoot, tempRoot);
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

  it("repairOrphans cleans interrupted-move staging dirs left in production", { timeout: 60000 }, async () => {
    expect(zipPath).not.toBeNull();
    tempRoot = nextTempRoot();
    targetRoot = path.join(repoRoot, tempRoot);
    await extractBackupTo(targetRoot, zipPath!);

    process.env.CONTENT_ROOT = tempRoot;
    vi.resetModules();
    const service = await import("./service");

    // Pre-flight: count any `.chapters-*` siblings under any book directory.
    const orphansBefore = await countChaptersOrphans(
      path.join(targetRoot, "books"),
    );

    const report = await service.repairOrphans();
    expect(report.scannedDirs).toBeGreaterThan(0);
    // Combined removed/restored count should match what we saw on disk.
    const cleaned =
      report.deletedStaging.length +
      report.deletedBackups.length +
      report.restoredBackups.length;
    expect(cleaned).toBe(orphansBefore);

    const orphansAfter = await countChaptersOrphans(
      path.join(targetRoot, "books"),
    );
    expect(orphansAfter).toBe(0);

    // Tree must still load after the cleanup — verifies we did not lose the
    // canonical chapters/ directories.
    const tree = await service.getContentTree();
    expect(tree.books.length).toBeGreaterThan(0);
  });
});

async function countChaptersOrphans(root: string): Promise<number> {
  let count = 0;
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name.startsWith(".chapters-")) {
        count += 1;
        continue;
      }
      if (entry.name.startsWith(".")) continue;
      await walk(full);
    }
  };
  await walk(root);
  return count;
}
