import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/content/service", () => ({
  getContentRevision: vi.fn(),
}));

import { checkContentRevision } from "./revision-check";
import { getContentRevision } from "@/lib/content/service";

const mockedGetContentRevision = vi.mocked(getContentRevision);

describe("checkContentRevision", () => {
  beforeEach(() => {
    mockedGetContentRevision.mockReset();
  });

  it("skips the check when no revision is provided (back-compat)", async () => {
    mockedGetContentRevision.mockResolvedValue("abc123");
    const result = await checkContentRevision({ chapterSlugs: ["a", "b"] });
    expect(result).toBeNull();
    expect(mockedGetContentRevision).not.toHaveBeenCalled();
  });

  it("skips the check when revision is an empty string", async () => {
    mockedGetContentRevision.mockResolvedValue("abc123");
    const result = await checkContentRevision({ revision: "" });
    expect(result).toBeNull();
  });

  it("returns null when revision matches current", async () => {
    mockedGetContentRevision.mockResolvedValue("abc123");
    const result = await checkContentRevision({ revision: "abc123" });
    expect(result).toBeNull();
  });

  it("returns 409 when revision is stale", async () => {
    mockedGetContentRevision.mockResolvedValue("current-xyz");
    const result = await checkContentRevision({ revision: "stale-abc" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe(409);
    const body = await result!.json();
    expect(body.code).toBe("REVISION_MISMATCH");
    expect(body.currentRevision).toBe("current-xyz");
    expect(body.error).toMatch(/changed/i);
  });

  it("handles a null payload without throwing", async () => {
    mockedGetContentRevision.mockResolvedValue("abc123");
    const result = await checkContentRevision(null);
    expect(result).toBeNull();
  });

  it("handles a non-object payload without throwing", async () => {
    mockedGetContentRevision.mockResolvedValue("abc123");
    const result = await checkContentRevision("not-an-object");
    expect(result).toBeNull();
  });
});
