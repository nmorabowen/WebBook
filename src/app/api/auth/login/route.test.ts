import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createSessionToken: vi.fn(),
  setSessionCookie: vi.fn(),
  verifyCredentials: vi.fn(),
}));

const activityLogMocks = vi.hoisted(() => ({
  appendLoginActivity: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/activity-log", () => activityLogMocks);

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("POST /api/auth/login", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records a login event after a successful sign-in", async () => {
    authMocks.verifyCredentials.mockResolvedValue({
      username: "editor-one",
      role: "editor",
    });
    authMocks.createSessionToken.mockResolvedValue("token");
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "editor-one",
          password: "secret",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(authMocks.setSessionCookie).toHaveBeenCalledWith("token");
    expect(activityLogMocks.appendLoginActivity).toHaveBeenCalledWith({
      username: "editor-one",
      role: "editor",
    });
  });

  it("does not record activity for invalid credentials", async () => {
    authMocks.verifyCredentials.mockResolvedValue(null);
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "editor-one",
          password: "bad-secret",
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(authMocks.createSessionToken).not.toHaveBeenCalled();
    expect(activityLogMocks.appendLoginActivity).not.toHaveBeenCalled();
  });
});
