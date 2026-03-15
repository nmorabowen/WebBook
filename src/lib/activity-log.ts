import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { SessionPayload } from "@/lib/auth";
import type { ContentRecord } from "@/lib/content/schemas";
import { getWorkspaceStorageLayout } from "@/lib/env";
import type { WorkspaceAccessScope } from "@/lib/workspace-access";

const ACTIVITY_LOG_FILE_NAME = "activity-log.json";
const ACTIVITY_LOG_LIMIT = 1_000;
const EDIT_COALESCE_WINDOW_MS = 10 * 60 * 1_000;

const activityLogActorSchema = z.object({
  username: z.string().min(1),
  role: z.enum(["admin", "editor"]),
});

const activityLogContentSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["book", "chapter", "note"]),
  title: z.string().min(1),
  slug: z.string().min(1),
  bookSlug: z.string().min(1).nullable(),
  chapterPath: z.array(z.string().min(1)).nullable(),
  workspaceRoute: z.string().min(1),
});

export const activityLogEntrySchema = z.object({
  id: z.string().min(1),
  eventType: z.enum(["login", "content-edit"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  count: z.number().int().positive(),
  actor: activityLogActorSchema,
  content: activityLogContentSchema.nullable(),
  message: z.string().min(1),
});

const activityLogStoreSchema = z.object({
  entries: z.array(activityLogEntrySchema).default([]),
});

export type ActivityLogActor = z.infer<typeof activityLogActorSchema>;
export type ActivityLogContent = z.infer<typeof activityLogContentSchema>;
export type ActivityLogEntry = z.infer<typeof activityLogEntrySchema>;

type AppendLoginActivityInput = ActivityLogActor & {
  createdAt?: string;
};

type AppendContentEditActivityInput = {
  actor: ActivityLogActor;
  content: ActivityLogContent;
  createdAt?: string;
};

let activityLogWriteQueue = Promise.resolve();

function timestampOrNow(value?: string) {
  return value ?? new Date().toISOString();
}

function parseTimestamp(value: string) {
  const parsed = new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : 0;
}

function coalesceableEditMatch(
  entry: ActivityLogEntry,
  input: AppendContentEditActivityInput,
  now: string,
) {
  if (entry.eventType !== "content-edit" || !entry.content) {
    return false;
  }

  if (entry.actor.username !== input.actor.username) {
    return false;
  }

  if (entry.content.id !== input.content.id) {
    return false;
  }

  return parseTimestamp(now) - parseTimestamp(entry.updatedAt) <= EDIT_COALESCE_WINDOW_MS;
}

function trimEntries(entries: ActivityLogEntry[]) {
  if (entries.length <= ACTIVITY_LOG_LIMIT) {
    return entries;
  }

  return entries.slice(entries.length - ACTIVITY_LOG_LIMIT);
}

async function withWriteQueue<T>(operation: () => Promise<T>) {
  const next = activityLogWriteQueue.catch(() => undefined).then(operation);
  activityLogWriteQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function readActivityLogStore() {
  const filePath = getActivityLogFilePath();

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const result = activityLogStoreSchema.safeParse(parsed);
    if (result.success) {
      return result.data.entries;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
  }

  return [];
}

async function writeActivityLogStore(entries: ActivityLogEntry[]) {
  const filePath = getActivityLogFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    JSON.stringify(
      activityLogStoreSchema.parse({
        entries: trimEntries(entries),
      }),
      null,
      2,
    ),
    "utf8",
  );
}

function buildLoginEntry(input: AppendLoginActivityInput) {
  const createdAt = timestampOrNow(input.createdAt);
  return activityLogEntrySchema.parse({
    id: randomUUID(),
    eventType: "login",
    createdAt,
    updatedAt: createdAt,
    count: 1,
    actor: {
      username: input.username,
      role: input.role,
    },
    content: null,
    message: "Signed in",
  });
}

function buildContentEditEntry(input: AppendContentEditActivityInput) {
  const createdAt = timestampOrNow(input.createdAt);
  return activityLogEntrySchema.parse({
    id: randomUUID(),
    eventType: "content-edit",
    createdAt,
    updatedAt: createdAt,
    count: 1,
    actor: input.actor,
    content: input.content,
    message: `Edited ${input.content.kind}`,
  });
}

function canAccessActivityContent(
  scope: WorkspaceAccessScope,
  content: ActivityLogContent,
) {
  if (scope.isAdmin) {
    return true;
  }

  if (content.kind === "note") {
    return scope.accessibleNoteIds.has(content.id);
  }

  if (content.kind === "book") {
    return scope.accessibleBookIds.has(content.id);
  }

  return Boolean(content.bookSlug && scope.accessibleBookSlugs.has(content.bookSlug));
}

export function getActivityLogFilePath() {
  const { systemRoot } = getWorkspaceStorageLayout();
  return path.join(systemRoot, ACTIVITY_LOG_FILE_NAME);
}

export function buildActivityLogContent(content: ContentRecord): ActivityLogContent {
  return activityLogContentSchema.parse({
    id: content.id,
    kind: content.kind,
    title: content.meta.title,
    slug: content.meta.slug,
    bookSlug: content.kind === "chapter" ? content.meta.bookSlug : null,
    chapterPath: content.kind === "chapter" ? content.path : null,
    workspaceRoute:
      content.kind === "book"
        ? `/app/books/${content.meta.slug}`
        : content.kind === "note"
          ? `/app/notes/${content.meta.slug}`
          : `/app/books/${content.meta.bookSlug}/chapters/${content.path.join("/")}`,
  });
}

export async function appendLoginActivity(input: AppendLoginActivityInput) {
  return withWriteQueue(async () => {
    const entries = await readActivityLogStore();
    const nextEntry = buildLoginEntry(input);
    entries.push(nextEntry);
    await writeActivityLogStore(entries);
    return nextEntry;
  });
}

export async function appendContentEditActivity(input: AppendContentEditActivityInput) {
  return withWriteQueue(async () => {
    const entries = await readActivityLogStore();
    const now = timestampOrNow(input.createdAt);
    const matchIndex = [...entries]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => coalesceableEditMatch(entry, input, now))?.index;

    if (matchIndex !== undefined) {
      const existing = entries[matchIndex];
      if (existing) {
        const nextEntry = activityLogEntrySchema.parse({
          ...existing,
          updatedAt: now,
          count: existing.count + 1,
          actor: input.actor,
          content: input.content,
          message: `Edited ${input.content.kind}`,
        });
        entries.splice(matchIndex, 1);
        entries.push(nextEntry);
        await writeActivityLogStore(entries);
        return nextEntry;
      }
    }

    const nextEntry = buildContentEditEntry({
      ...input,
      createdAt: now,
    });
    entries.push(nextEntry);
    await writeActivityLogStore(entries);
    return nextEntry;
  });
}

export async function listActivityLogEntries(limit = 50) {
  const entries = await readActivityLogStore();
  const clampedLimit = Math.max(1, Math.min(limit, ACTIVITY_LOG_LIMIT));
  return entries.slice(-clampedLimit).reverse();
}

export function filterActivityLogEntriesForScope(
  entries: ActivityLogEntry[],
  scope: WorkspaceAccessScope,
) {
  if (scope.isAdmin) {
    return entries;
  }

  return entries.filter((entry) => {
    if (entry.eventType === "login") {
      return entry.actor.username === scope.session.username;
    }

    if (!entry.content) {
      return false;
    }

    return canAccessActivityContent(scope, entry.content);
  });
}

export async function listVisibleActivityLogEntries(
  scope: WorkspaceAccessScope,
  limit = 50,
) {
  const entries = await readActivityLogStore();
  const filtered = filterActivityLogEntriesForScope(entries.reverse(), scope);
  return filtered.slice(0, Math.max(1, limit));
}

export function createActivityActor(session: SessionPayload): ActivityLogActor {
  return activityLogActorSchema.parse({
    username: session.username,
    role: session.role,
  });
}
