import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requireSession: vi.fn() }));
const contentMocks = vi.hoisted(() => ({ repairOrphans: vi.fn() }));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/content/service", () => contentMocks);

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("POST /api/settings/general/repair-orphans", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin sessions with 403", async () => {
    authMocks.requireSession.mockResolvedValue({ username: "ed", role: "editor" });

    const route = await loadRoute();
    const response = await route.POST();

    expect(response.status).toBe(403);
    expect(contentMocks.repairOrphans).not.toHaveBeenCalled();
  });

  it("returns the repair report for admins", async () => {
    authMocks.requireSession.mockResolvedValue({ username: "admin", role: "admin" });
    const report = {
      scannedDirs: 7,
      restoredBackups: [],
      deletedBackups: [],
      deletedStaging: ["/path/.chapters-delete-1"],
    };
    contentMocks.repairOrphans.mockResolvedValue(report);

    const route = await loadRoute();
    const response = await route.POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect(contentMocks.repairOrphans).toHaveBeenCalledOnce();
  });

  it("returns 500 when repairOrphans throws", async () => {
    authMocks.requireSession.mockResolvedValue({ username: "admin", role: "admin" });
    contentMocks.repairOrphans.mockRejectedValue(new Error("boom"));

    const route = await loadRoute();
    const response = await route.POST();

    expect(response.status).toBe(500);
  });
});
