import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requireSession: vi.fn() }));
const contentMocks = vi.hoisted(() => ({ moveContent: vi.fn() }));
const revisionMocks = vi.hoisted(() => ({ checkContentRevision: vi.fn() }));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/content/service", () => contentMocks);
vi.mock("@/lib/content/revision-check", () => revisionMocks);

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/content/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/content/move", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin sessions with 403", async () => {
    authMocks.requireSession.mockResolvedValue({ username: "ed", role: "editor" });
    revisionMocks.checkContentRevision.mockResolvedValue(null);

    const route = await loadRoute();
    const response = await route.POST(makeRequest({}));

    expect(response.status).toBe(403);
    expect(contentMocks.moveContent).not.toHaveBeenCalled();
  });

  it("forwards the payload to moveContent for admins", async () => {
    authMocks.requireSession.mockResolvedValue({ username: "admin", role: "admin" });
    revisionMocks.checkContentRevision.mockResolvedValue(null);
    contentMocks.moveContent.mockResolvedValue({ ok: true });

    const payload = {
      source: { kind: "note", slug: "alpha" },
      destination: { parent: { kind: "book", bookSlug: "fem" }, role: "note" },
    };
    const route = await loadRoute();
    const response = await route.POST(makeRequest(payload));

    expect(response.status).toBe(200);
    expect(contentMocks.moveContent).toHaveBeenCalledWith(payload);
  });

  it("returns the stale-revision response from checkContentRevision unchanged", async () => {
    authMocks.requireSession.mockResolvedValue({ username: "admin", role: "admin" });
    const stale = new Response("stale", { status: 409 });
    revisionMocks.checkContentRevision.mockResolvedValue(stale);

    const route = await loadRoute();
    const response = await route.POST(makeRequest({}));

    expect(response.status).toBe(409);
    expect(contentMocks.moveContent).not.toHaveBeenCalled();
  });

  it("converts moveContent errors into a 400", async () => {
    authMocks.requireSession.mockResolvedValue({ username: "admin", role: "admin" });
    revisionMocks.checkContentRevision.mockResolvedValue(null);
    contentMocks.moveContent.mockRejectedValue(new Error("nope"));

    const route = await loadRoute();
    const response = await route.POST(makeRequest({}));

    expect(response.status).toBe(400);
  });
});
