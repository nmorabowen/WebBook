import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const tempRoot = ".tmp-error-log-test";

async function loadErrorLog() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./error-log");
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), {
    recursive: true,
    force: true,
  });
});

describe("error log", () => {
  it("appends entries and returns them newest first", async () => {
    const errorLog = await loadErrorLog();

    await errorLog.appendErrorLog({
      username: "admin",
      role: "admin",
      message: "First failure",
      pathname: "/app/settings/general",
      source: "test-suite",
    });

    await errorLog.appendErrorLog({
      username: "editor-one",
      role: "editor",
      message: "Second failure",
      digest: "digest-2",
    });

    const entries = await errorLog.listErrorLogs(10);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.message).toBe("Second failure");
    expect(entries[1]?.message).toBe("First failure");
    expect(entries[0]?.digest).toBe("digest-2");

    await expect(fs.readFile(errorLog.getErrorLogFilePath(), "utf8")).resolves.toContain(
      "First failure",
    );
  });

  it("ignores malformed lines and normalizes optional values", async () => {
    const errorLog = await loadErrorLog();
    const filePath = errorLog.getErrorLogFilePath();

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, "{\"broken\":true}\nnot-json\n", "utf8");

    await errorLog.appendErrorLog({
      username: "admin",
      role: "admin",
      message: "x".repeat(2_000),
      source: "   ",
      pathname: "   /app   ",
    });

    const entries = await errorLog.listErrorLogs(10);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message.length).toBeLessThanOrEqual(1_200);
    expect(entries[0]?.source).toBe("workspace-error-boundary");
    expect(entries[0]?.pathname).toBe("/app");
  });
});
