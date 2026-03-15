import { afterEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  deleteBook: vi.fn(),
  getBook: vi.fn(),
  isMissingWorkspaceContentError: vi.fn(),
  updateBook: vi.fn(),
}));

const accessMocks = vi.hoisted(() => ({
  buildWorkspaceAccessScope: vi.fn(),
  canAccessBook: vi.fn(),
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

describe("PUT /api/books/[bookSlug]", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("records an edit event after a successful book save", async () => {
    const session = { username: "admin", role: "admin" as const };
    const book = { id: "book-1", meta: { id: "book-1", slug: "book-a" } };
    authMocks.requireSession.mockResolvedValue(session);
    contentMocks.getBook.mockResolvedValue(book);
    accessMocks.buildWorkspaceAccessScope.mockResolvedValue({ isAdmin: true });
    accessMocks.canAccessBook.mockReturnValue(true);
    contentMocks.updateBook.mockResolvedValue(book);
    contentMocks.isMissingWorkspaceContentError.mockReturnValue(false);
    activityLogMocks.createActivityActor.mockReturnValue({
      username: "admin",
      role: "admin",
    });
    activityLogMocks.buildActivityLogContent.mockReturnValue({
      id: "book-1",
      kind: "book",
      title: "Book A",
      slug: "book-a",
      bookSlug: null,
      chapterPath: null,
      workspaceRoute: "/app/books/book-a",
    });

    const { PUT } = await loadRoute();
    const response = await PUT(
      new Request("http://localhost/api/books/book-a", {
        method: "PUT",
        body: JSON.stringify({ title: "Book A" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      { params: Promise.resolve({ bookSlug: "book-a" }) },
    );

    expect(response.status).toBe(200);
    expect(activityLogMocks.appendContentEditActivity).toHaveBeenCalledWith({
      actor: { username: "admin", role: "admin" },
      content: {
        id: "book-1",
        kind: "book",
        title: "Book A",
        slug: "book-a",
        bookSlug: null,
        chapterPath: null,
        workspaceRoute: "/app/books/book-a",
      },
    });
  });

  it("does not record an edit event when access is denied", async () => {
    const session = { username: "editor-one", role: "editor" as const };
    authMocks.requireSession.mockResolvedValue(session);
    contentMocks.getBook.mockResolvedValue({
      id: "book-1",
      meta: { id: "book-1", slug: "book-a" },
    });
    accessMocks.buildWorkspaceAccessScope.mockResolvedValue({ isAdmin: false });
    accessMocks.canAccessBook.mockReturnValue(false);
    contentMocks.isMissingWorkspaceContentError.mockReturnValue(false);

    const { PUT } = await loadRoute();
    const response = await PUT(
      new Request("http://localhost/api/books/book-a", {
        method: "PUT",
        body: JSON.stringify({ title: "Book A" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      { params: Promise.resolve({ bookSlug: "book-a" }) },
    );

    expect(response.status).toBe(404);
    expect(contentMocks.updateBook).not.toHaveBeenCalled();
    expect(activityLogMocks.appendContentEditActivity).not.toHaveBeenCalled();
  });
});
