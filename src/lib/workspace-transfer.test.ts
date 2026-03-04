import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import {
  buildWorkspaceArchive,
  restoreWorkspaceArchive,
  WorkspaceArchiveTooLargeError,
} from "@/lib/workspace-transfer";

const tempDirectories: string[] = [];

async function makeTempDirectory(prefix: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

async function writeFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("workspace transfer", () => {
  it("exports and restores the full workspace tree", async () => {
    const sourceRoot = await makeTempDirectory("webbook-export-source-");
    const destinationRoot = await makeTempDirectory("webbook-export-destination-");
    const sourceContent = path.join(sourceRoot, "content");
    const destinationContent = path.join(destinationRoot, "content");

    await writeFile(
      path.join(sourceContent, "books", "fem", "book.md"),
      "---\ntitle: FEM\n---\nBook body",
    );
    await writeFile(
      path.join(sourceContent, ".webbook", "settings.json"),
      JSON.stringify({ cornerRadius: 14 }, null, 2),
    );
    await writeFile(
      path.join(sourceContent, ".webbook", "users.json"),
      JSON.stringify({ users: [{ username: "admin" }] }, null, 2),
    );
    await writeFile(
      path.join(sourceContent, ".webbook", "uploads", "figure.png"),
      "fake-image-data",
    );

    const archive = await buildWorkspaceArchive(sourceContent);

    await writeFile(
      path.join(destinationContent, "notes", "legacy.md"),
      "---\ntitle: Legacy\n---\nOld content",
    );

    await restoreWorkspaceArchive(archive, destinationContent);

    await expect(
      fs.readFile(path.join(destinationContent, "books", "fem", "book.md"), "utf8"),
    ).resolves.toContain("Book body");
    await expect(
      fs.readFile(path.join(destinationContent, ".webbook", "settings.json"), "utf8"),
    ).resolves.toContain("\"cornerRadius\": 14");
    await expect(
      fs.readFile(path.join(destinationContent, ".webbook", "users.json"), "utf8"),
    ).resolves.toContain("\"username\": \"admin\"");
    await expect(
      fs.readFile(path.join(destinationContent, ".webbook", "uploads", "figure.png"), "utf8"),
    ).resolves.toBe("fake-image-data");
    await expect(
      fs.access(path.join(destinationContent, "notes", "legacy.md")),
    ).rejects.toThrow();
  });

  it("rejects archives without a WebBook manifest", async () => {
    const destinationRoot = await makeTempDirectory("webbook-export-invalid-");
    const destinationContent = path.join(destinationRoot, "content");
    const zip = new JSZip();
    zip.file("content/books/fem/book.md", "test");
    const archive = await zip.generateAsync({ type: "nodebuffer" });

    await expect(restoreWorkspaceArchive(archive, destinationContent)).rejects.toThrow(
      "Archive manifest is missing",
    );
  });

  it("rejects archive entries that escape the workspace root", async () => {
    const destinationRoot = await makeTempDirectory("webbook-export-unsafe-");
    const destinationContent = path.join(destinationRoot, "content");
    const zip = new JSZip();
    zip.file(
      "webbook-export.json",
      JSON.stringify({
        format: "webbook-workspace",
        version: 1,
        exportedAt: new Date().toISOString(),
      }),
    );
    zip.file("content/..\\escape.txt", "escaped");
    const archive = await zip.generateAsync({ type: "nodebuffer" });

    await expect(restoreWorkspaceArchive(archive, destinationContent)).rejects.toThrow(
      "Archive contains an unsafe path",
    );
    await expect(fs.access(path.join(destinationRoot, "escape.txt"))).rejects.toThrow();
  });

  it("enforces workspace archive size limits", async () => {
    const sourceRoot = await makeTempDirectory("webbook-export-size-source-");
    const sourceContent = path.join(sourceRoot, "content");
    const destinationRoot = await makeTempDirectory("webbook-export-size-destination-");
    const destinationContent = path.join(destinationRoot, "content");

    await writeFile(path.join(sourceContent, "notes", "large.md"), "0123456789");

    await expect(
      buildWorkspaceArchive(sourceContent, { maxWorkspaceBytes: 4 }),
    ).rejects.toThrow(WorkspaceArchiveTooLargeError);

    const archive = await buildWorkspaceArchive(sourceContent, {
      maxWorkspaceBytes: 128,
    });

    await expect(
      restoreWorkspaceArchive(archive, destinationContent, { maxArchiveBytes: 4 }),
    ).rejects.toThrow(WorkspaceArchiveTooLargeError);
  });

  it("falls back to an in-place replace when the content root cannot be renamed", async () => {
    const sourceRoot = await makeTempDirectory("webbook-export-mounted-source-");
    const destinationRoot = await makeTempDirectory("webbook-export-mounted-destination-");
    const sourceContent = path.join(sourceRoot, "content");
    const destinationContent = path.join(destinationRoot, "content");

    await writeFile(
      path.join(sourceContent, "books", "fem", "book.md"),
      "---\ntitle: FEM\n---\nMounted import",
    );
    await writeFile(
      path.join(destinationContent, "notes", "legacy.md"),
      "---\ntitle: Legacy\n---\nOld content",
    );

    const archive = await buildWorkspaceArchive(sourceContent);
    const originalRename = fs.rename.bind(fs);
    const renameSpy = vi
      .spyOn(fs, "rename")
      .mockImplementation(async (sourcePath, targetPath) => {
        if (
          sourcePath === destinationContent &&
          String(targetPath).includes(".content-backup-")
        ) {
          const error = new Error("resource busy or locked") as NodeJS.ErrnoException;
          error.code = "EBUSY";
          throw error;
        }

        return originalRename(sourcePath, targetPath);
      });

    try {
      await restoreWorkspaceArchive(archive, destinationContent);
    } finally {
      renameSpy.mockRestore();
    }

    await expect(
      fs.readFile(path.join(destinationContent, "books", "fem", "book.md"), "utf8"),
    ).resolves.toContain("Mounted import");
    await expect(
      fs.access(path.join(destinationContent, "notes", "legacy.md")),
    ).rejects.toThrow();
  });
});
