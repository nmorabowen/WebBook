import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import type { WorkspaceAccessScope } from "@/lib/workspace-access";
import type { ActivityLogEntry } from "./activity-log";

const tempRoot = ".tmp-activity-log-test";

async function loadActivityLog() {
  process.env.CONTENT_ROOT = tempRoot;
  vi.resetModules();
  return import("./activity-log");
}

function createEditorScope(): WorkspaceAccessScope {
  return {
    session: { username: "editor-one", role: "editor" },
    isAdmin: false,
    assignments: {
      bookIds: ["book-1"],
      noteIds: ["note-1"],
    },
    accessibleBookIds: new Set(["book-1"]),
    accessibleNoteIds: new Set(["note-1"]),
    accessibleBookSlugs: new Set(["book-a"]),
    accessibleNoteSlugs: new Set(["note-a"]),
  };
}

afterEach(async () => {
  delete process.env.CONTENT_ROOT;
  await fs.rm(path.join(process.cwd(), tempRoot), {
    recursive: true,
    force: true,
  });
});

describe("activity log", () => {
  it("appends successful login entries", async () => {
    const activityLog = await loadActivityLog();

    await activityLog.appendLoginActivity({
      username: "editor-one",
      role: "editor",
      createdAt: "2026-03-15T12:00:00.000Z",
    });

    const entries = await activityLog.listActivityLogEntries(10);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      eventType: "login",
      message: "Signed in",
      actor: { username: "editor-one", role: "editor" },
      content: null,
      count: 1,
    });
  });

  it("appends content edit entries with normalized metadata", async () => {
    const activityLog = await loadActivityLog();
    const content = activityLog.buildActivityLogContent({
      id: "note-1",
      kind: "note",
      filePath: "content/notes/note-a.md",
      route: "/notes/note-a",
      body: "body",
      raw: "raw",
      meta: {
        id: "note-1",
        kind: "note",
        title: "Note A",
        slug: "note-a",
        createdAt: "2026-03-15T11:00:00.000Z",
        updatedAt: "2026-03-15T12:00:00.000Z",
        routeAliases: [],
        status: "draft",
        allowExecution: true,
      },
      location: { kind: "root" },
    });

    await activityLog.appendContentEditActivity({
      actor: { username: "admin", role: "admin" },
      createdAt: "2026-03-15T12:00:00.000Z",
      content,
    });

    const [entry] = await activityLog.listActivityLogEntries(10);

    expect(entry).toMatchObject({
      eventType: "content-edit",
      message: "Edited note",
      content: {
        id: "note-1",
        kind: "note",
        title: "Note A",
        workspaceRoute: "/app/notes/note-a",
      },
      count: 1,
    });
  });

  it("coalesces repeated edits by the same user on the same content within the window", async () => {
    const activityLog = await loadActivityLog();

    await activityLog.appendContentEditActivity({
      actor: { username: "editor-one", role: "editor" },
      createdAt: "2026-03-15T12:00:00.000Z",
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

    await activityLog.appendContentEditActivity({
      actor: { username: "editor-one", role: "editor" },
      createdAt: "2026-03-15T12:08:00.000Z",
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

    const entries = await activityLog.listActivityLogEntries(10);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      count: 2,
      createdAt: "2026-03-15T12:00:00.000Z",
      updatedAt: "2026-03-15T12:08:00.000Z",
    });
  });

  it("does not coalesce across different users, content, or outside the window", async () => {
    const activityLog = await loadActivityLog();

    await activityLog.appendContentEditActivity({
      actor: { username: "editor-one", role: "editor" },
      createdAt: "2026-03-15T12:00:00.000Z",
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
    await activityLog.appendContentEditActivity({
      actor: { username: "editor-two", role: "editor" },
      createdAt: "2026-03-15T12:05:00.000Z",
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
    await activityLog.appendContentEditActivity({
      actor: { username: "editor-one", role: "editor" },
      createdAt: "2026-03-15T12:06:00.000Z",
      content: {
        id: "note-2",
        kind: "note",
        title: "Note B",
        slug: "note-b",
        bookSlug: null,
        chapterPath: null,
        workspaceRoute: "/app/notes/note-b",
      },
    });
    await activityLog.appendContentEditActivity({
      actor: { username: "editor-one", role: "editor" },
      createdAt: "2026-03-15T12:11:00.000Z",
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

    const entries = await activityLog.listActivityLogEntries(10);

    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.count)).toEqual([1, 1, 1, 1]);
  });

  it("trims old entries beyond the retention cap", async () => {
    const activityLog = await loadActivityLog();

    for (let index = 0; index < 1_005; index += 1) {
      await activityLog.appendLoginActivity({
        username: `editor-${index}`,
        role: "editor",
        createdAt: `2026-03-15T12:${String(index % 60).padStart(2, "0")}:00.000Z`,
      });
    }

    const entries = await activityLog.listActivityLogEntries(100);
    const raw = await fs.readFile(activityLog.getActivityLogFilePath(), "utf8");
    const parsed = JSON.parse(raw) as { entries: Array<{ actor: { username: string } }> };

    expect(parsed.entries).toHaveLength(1_000);
    expect(entries[0]?.actor.username).toBe("editor-1004");
    expect(parsed.entries[0]?.actor.username).toBe("editor-5");
  });

  it("filters visible entries for admins and editors", async () => {
    const activityLog = await loadActivityLog();
    const entries: ActivityLogEntry[] = [
      {
        id: "login-self",
        eventType: "login",
        createdAt: "2026-03-15T12:00:00.000Z",
        updatedAt: "2026-03-15T12:00:00.000Z",
        count: 1,
        actor: { username: "editor-one", role: "editor" },
        content: null,
        message: "Signed in",
      },
      {
        id: "login-other",
        eventType: "login",
        createdAt: "2026-03-15T12:05:00.000Z",
        updatedAt: "2026-03-15T12:05:00.000Z",
        count: 1,
        actor: { username: "editor-two", role: "editor" },
        content: null,
        message: "Signed in",
      },
      {
        id: "note-visible",
        eventType: "content-edit",
        createdAt: "2026-03-15T12:10:00.000Z",
        updatedAt: "2026-03-15T12:10:00.000Z",
        count: 1,
        actor: { username: "editor-two", role: "editor" },
        content: {
          id: "note-1",
          kind: "note",
          title: "Note A",
          slug: "note-a",
          bookSlug: null,
          chapterPath: null,
          workspaceRoute: "/app/notes/note-a",
        },
        message: "Edited note",
      },
      {
        id: "note-hidden",
        eventType: "content-edit",
        createdAt: "2026-03-15T12:15:00.000Z",
        updatedAt: "2026-03-15T12:15:00.000Z",
        count: 1,
        actor: { username: "editor-two", role: "editor" },
        content: {
          id: "note-2",
          kind: "note",
          title: "Note B",
          slug: "note-b",
          bookSlug: null,
          chapterPath: null,
          workspaceRoute: "/app/notes/note-b",
        },
        message: "Edited note",
      },
    ];

    const editorScope = createEditorScope();
    const adminScope: WorkspaceAccessScope = {
      ...editorScope,
      session: { username: "admin", role: "admin" },
      isAdmin: true,
    };

    expect(
      activityLog.filterActivityLogEntriesForScope(entries, editorScope).map((entry) => entry.id),
    ).toEqual(["login-self", "note-visible"]);
    expect(
      activityLog.filterActivityLogEntriesForScope(entries, adminScope).map((entry) => entry.id),
    ).toEqual(["login-self", "login-other", "note-visible", "note-hidden"]);
  });
});
