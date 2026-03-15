import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  deleteChapter: vi.fn(),
  getChapter: vi.fn(),
  updateChapterContent: vi.fn(),
}));

const accessMocks = vi.hoisted(() => ({
  buildWorkspaceAccessScope: vi.fn(),
  canAccessChapter: vi.fn(),
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

describe("PUT /api/books/[bookSlug]/chapters/[...chapterPath]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records an edit event after a successful chapter save", async () => {
    const session = { username: "editor-one", role: "editor" as const };
    const chapter = {
      id: "chapter-1",
      meta: { bookSlug: "book-a", slug: "chapter-a" },
      path: ["chapter-a"],
    };
    authMocks.requireSession.mockResolvedValue(session);
    contentMocks.getChapter.mockResolvedValue(chapter);
    accessMocks.buildWorkspaceAccessScope.mockResolvedValue({ isAdmin: false });
    accessMocks.canAccessChapter.mockReturnValue(true);
    contentMocks.updateChapterContent.mockResolvedValue(chapter);
    activityLogMocks.createActivityActor.mockReturnValue({
      username: "editor-one",
      role: "editor",
    });
    activityLogMocks.buildActivityLogContent.mockReturnValue({
      id: "chapter-1",
      kind: "chapter",
      title: "Chapter A",
      slug: "chapter-a",
      bookSlug: "book-a",
      chapterPath: ["chapter-a"],
      workspaceRoute: "/app/books/book-a/chapters/chapter-a",
    });

    const { PUT } = await loadRoute();
    const response = await PUT(
      new Request("http://localhost/api/books/book-a/chapters/chapter-a", {
        method: "PUT",
        body: JSON.stringify({ title: "Chapter A" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      { params: Promise.resolve({ bookSlug: "book-a", chapterPath: ["chapter-a"] }) },
    );

    expect(response.status).toBe(200);
    expect(activityLogMocks.appendContentEditActivity).toHaveBeenCalledWith({
      actor: { username: "editor-one", role: "editor" },
      content: {
        id: "chapter-1",
        kind: "chapter",
        title: "Chapter A",
        slug: "chapter-a",
        bookSlug: "book-a",
        chapterPath: ["chapter-a"],
        workspaceRoute: "/app/books/book-a/chapters/chapter-a",
      },
    });
  });

  it("does not record an edit event for missing chapters", async () => {
    authMocks.requireSession.mockResolvedValue({
      username: "editor-one",
      role: "editor",
    });
    contentMocks.getChapter.mockResolvedValue(null);

    const { PUT } = await loadRoute();
    const response = await PUT(
      new Request("http://localhost/api/books/book-a/chapters/missing", {
        method: "PUT",
        body: JSON.stringify({ title: "Missing chapter" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      { params: Promise.resolve({ bookSlug: "book-a", chapterPath: ["missing"] }) },
    );

    expect(response.status).toBe(404);
    expect(contentMocks.updateChapterContent).not.toHaveBeenCalled();
    expect(activityLogMocks.appendContentEditActivity).not.toHaveBeenCalled();
  });
});
