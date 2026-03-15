import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  getContentTree: vi.fn(),
  getGeneralSettings: vi.fn(),
}));

const activityLogMocks = vi.hoisted(() => ({
  getActivityLogFilePath: vi.fn(),
  listVisibleActivityLogEntries: vi.fn(),
}));

const accessMocks = vi.hoisted(() => ({
  buildWorkspaceAccessScope: vi.fn(),
  filterContentTreeForScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/content/service", () => contentMocks);
vi.mock("@/lib/activity-log", () => activityLogMocks);
vi.mock("@/lib/workspace-access", () => accessMocks);
vi.mock("@/components/app-shell", () => ({
  AppShell: ({
    children,
    rightPanel,
  }: {
    children: ReactNode;
    rightPanel?: ReactNode;
  }) => (
    <div>
      <aside>{rightPanel}</aside>
      <main>{children}</main>
    </div>
  ),
}));

async function loadPage() {
  vi.resetModules();
  return import("./page");
}

describe("/app/settings/activity page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the full visible stream for admins", async () => {
    authMocks.requireSession.mockResolvedValue({
      username: "admin",
      role: "admin",
    });
    contentMocks.getContentTree.mockResolvedValue({ books: [], notes: [] });
    contentMocks.getGeneralSettings.mockResolvedValue(undefined);
    accessMocks.buildWorkspaceAccessScope.mockResolvedValue({
      session: { username: "admin", role: "admin" },
      isAdmin: true,
      assignments: { bookIds: [], noteIds: [] },
      accessibleBookIds: new Set(),
      accessibleNoteIds: new Set(),
      accessibleBookSlugs: new Set(),
      accessibleNoteSlugs: new Set(),
    });
    accessMocks.filterContentTreeForScope.mockReturnValue({ books: [], notes: [] });
    activityLogMocks.getActivityLogFilePath.mockReturnValue("content/.webbook/activity-log.json");
    activityLogMocks.listVisibleActivityLogEntries.mockResolvedValue([
      {
        id: "admin-login",
        eventType: "login",
        createdAt: "2026-03-15T12:00:00.000Z",
        updatedAt: "2026-03-15T12:00:00.000Z",
        count: 1,
        actor: { username: "admin", role: "admin" },
        content: null,
        message: "Signed in",
      },
      {
        id: "admin-edit",
        eventType: "content-edit",
        createdAt: "2026-03-15T12:05:00.000Z",
        updatedAt: "2026-03-15T12:05:00.000Z",
        count: 1,
        actor: { username: "editor-one", role: "editor" },
        content: {
          id: "note-1",
          kind: "note",
          title: "Visible note",
          slug: "visible-note",
          bookSlug: null,
          chapterPath: null,
          workspaceRoute: "/app/notes/visible-note",
        },
        message: "Edited note",
      },
    ]);

    const { default: ActivityPage } = await loadPage();
    const html = renderToStaticMarkup(await ActivityPage());

    expect(html).toContain("Activity log");
    expect(html).toContain("Visible note");
    expect(html).toContain("Signed in");
  });

  it("renders the scoped stream for editors", async () => {
    authMocks.requireSession.mockResolvedValue({
      username: "editor-one",
      role: "editor",
    });
    contentMocks.getContentTree.mockResolvedValue({ books: [], notes: [] });
    contentMocks.getGeneralSettings.mockResolvedValue(undefined);
    accessMocks.buildWorkspaceAccessScope.mockResolvedValue({
      session: { username: "editor-one", role: "editor" },
      isAdmin: false,
      assignments: { bookIds: ["book-1"], noteIds: ["note-1"] },
      accessibleBookIds: new Set(["book-1"]),
      accessibleNoteIds: new Set(["note-1"]),
      accessibleBookSlugs: new Set(["book-a"]),
      accessibleNoteSlugs: new Set(["note-a"]),
    });
    accessMocks.filterContentTreeForScope.mockReturnValue({ books: [], notes: [] });
    activityLogMocks.getActivityLogFilePath.mockReturnValue("content/.webbook/activity-log.json");
    activityLogMocks.listVisibleActivityLogEntries.mockResolvedValue([
      {
        id: "editor-login",
        eventType: "login",
        createdAt: "2026-03-15T12:00:00.000Z",
        updatedAt: "2026-03-15T12:00:00.000Z",
        count: 1,
        actor: { username: "editor-one", role: "editor" },
        content: null,
        message: "Signed in",
      },
      {
        id: "visible-edit",
        eventType: "content-edit",
        createdAt: "2026-03-15T12:05:00.000Z",
        updatedAt: "2026-03-15T12:05:00.000Z",
        count: 1,
        actor: { username: "admin", role: "admin" },
        content: {
          id: "note-1",
          kind: "note",
          title: "Scoped note",
          slug: "scoped-note",
          bookSlug: null,
          chapterPath: null,
          workspaceRoute: "/app/notes/scoped-note",
        },
        message: "Edited note",
      },
    ]);

    const { default: ActivityPage } = await loadPage();
    const html = renderToStaticMarkup(await ActivityPage());

    expect(html).toContain("editor-one");
    expect(html).toContain("Scoped note");
    expect(html).not.toContain("Hidden note");
    expect(html).toContain("Editors see a scoped view");
  });
});
