import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildWorkspaceArchive,
  restoreWorkspaceArchive,
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
});
