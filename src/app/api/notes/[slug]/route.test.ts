import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  deleteNote: vi.fn(),
  getNote: vi.fn(),
  updateNote: vi.fn(),
}));

const accessMocks = vi.hoisted(() => ({
  buildWorkspaceAccessScope: vi.fn(),
  canAccessNote: vi.fn(),
}));

const activityLogMocks = vi.hoisted(() => ({
  appendContentEditActivity: vi.fn(),
  buildActivityLogContent: vi.fn(),
  createActivityActor: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/content/service", () => contentMocks);
vi.mock("@/lib/workspace-access", () => accessMocks);
vi.mock("@/lib/activity-log", () => activityLogMocks);

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("PUT /api/notes/[slug]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records an edit event after a successful note save", async () => {
    const session = { username: "editor-one", role: "editor" as const };
    const existingNote = { id: "note-1", meta: { id: "note-1", slug: "note-a" } };
    const updatedNote = { id: "note-1", meta: { id: "note-1", slug: "note-a" } };
    authMocks.requireSession.mockResolvedValue(session);
    contentMocks.getNote.mockResolvedValue(existingNote);
    accessMocks.buildWorkspaceAccessScope.mockResolvedValue({ isAdmin: false });
    accessMocks.canAccessNote.mockReturnValue(true);
    contentMocks.updateNote.mockResolvedValue(updatedNote);
    activityLogMocks.createActivityActor.mockReturnValue({
      username: "editor-one",
      role: "editor",
    });
    activityLogMocks.buildActivityLogContent.mockReturnValue({
      id: "note-1",
      kind: "note",
      title: "Note A",
      slug: "note-a",
      bookSlug: null,
      chapterPath: null,
      workspaceRoute: "/app/notes/note-a",
    });

    const { PUT } = await loadRoute();
    const response = await PUT(
      new Request("http://localhost/api/notes/note-a", {
        method: "PUT",
        body: JSON.stringify({ title: "Note A" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      { params: Promise.resolve({ slug: "note-a" }) },
    );

    expect(response.status).toBe(200);
    expect(activityLogMocks.appendContentEditActivity).toHaveBeenCalledWith({
      actor: { username: "editor-one", role: "editor" },
      content: {
        id: "note-1",
        kind: "note",
        title: "Note A",
        slug: "note-a",
        bookSlug: null,
        chapterPath: null,
        workspaceRoute: "/app/notes/note-a",
      },
    });
  });

  it("does not record an edit event for not-found or rejected saves", async () => {
    const session = { username: "editor-one", role: "editor" as const };
    authMocks.requireSession.mockResolvedValue(session);
    contentMocks.getNote.mockResolvedValue(null);

    const { PUT } = await loadRoute();
    const notFoundResponse = await PUT(
      new Request("http://localhost/api/notes/missing", {
        method: "PUT",
        body: JSON.stringify({ title: "Missing note" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      { params: Promise.resolve({ slug: "missing" }) },
    );

    expect(notFoundResponse.status).toBe(404);
    expect(activityLogMocks.appendContentEditActivity).not.toHaveBeenCalled();

    const existingNote = { id: "note-1", meta: { id: "note-1", slug: "note-a" } };
    contentMocks.getNote.mockResolvedValue(existingNote);
    accessMocks.buildWorkspaceAccessScope.mockResolvedValue({ isAdmin: false });
    accessMocks.canAccessNote.mockReturnValue(true);
    contentMocks.updateNote.mockRejectedValue(new Error("boom"));

    const failedResponse = await PUT(
      new Request("http://localhost/api/notes/note-a", {
        method: "PUT",
        body: JSON.stringify({ title: "Note A" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      { params: Promise.resolve({ slug: "note-a" }) },
    );

    expect(failedResponse.status).toBe(400);
    expect(activityLogMocks.appendContentEditActivity).not.toHaveBeenCalled();
  });
});
