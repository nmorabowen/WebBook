import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-content-test";

async function loadService() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./service");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), {
    recursive: true,
    force: true,
  });
});

describe("content service", () => {
  it("creates a sample content scaffold and searchable content", async () => {
    const service = await loadService();
    await service.ensureContentScaffold();

    const tree = await service.getContentTree();
    expect(tree.books.length).toBeGreaterThan(0);
    expect(tree.notes.length).toBeGreaterThan(0);

    const searchResults = await service.searchContent("Computational");
    expect(searchResults[0]?.title).toContain("Computational");
  });
});
