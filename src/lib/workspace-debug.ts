import { z } from "zod";

const WORKSPACE_DEBUG_STORAGE_KEY = "webbook.workspace-debug-trail";
const MAX_DEBUG_EVENTS = 40;
const MAX_MESSAGE_LENGTH = 160;
const MAX_DETAIL_LENGTH = 600;

export const workspaceDebugEventSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  level: z.enum(["info", "error"]),
  category: z.enum(["navigation", "action", "network", "runtime", "system"]),
  message: z.string(),
  detail: z.string().nullable(),
});

export type WorkspaceDebugEvent = z.infer<typeof workspaceDebugEventSchema>;

type WorkspaceDebugEventInput = {
  level?: WorkspaceDebugEvent["level"];
  category: WorkspaceDebugEvent["category"];
  message: string;
  detail?: string | null;
};

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function normalizeWorkspaceDebugEvent(
  input: WorkspaceDebugEventInput,
): WorkspaceDebugEvent {
  return workspaceDebugEventSchema.parse({
    id: createId(),
    createdAt: new Date().toISOString(),
    level: input.level ?? "info",
    category: input.category,
    message:
      normalizeOptionalText(input.message, MAX_MESSAGE_LENGTH) ??
      "Workspace debug event",
    detail: normalizeOptionalText(input.detail, MAX_DETAIL_LENGTH),
  });
}

export function readWorkspaceDebugTrail() {
  const storage = getSessionStorage();
  if (!storage) {
    return [] as WorkspaceDebugEvent[];
  }

  try {
    const raw = storage.getItem(WORKSPACE_DEBUG_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry) => {
      const result = workspaceDebugEventSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

export function writeWorkspaceDebugTrail(events: WorkspaceDebugEvent[]) {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      WORKSPACE_DEBUG_STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_DEBUG_EVENTS)),
    );
  } catch {}
}

export function recordWorkspaceDebugEvent(input: WorkspaceDebugEventInput) {
  const nextEvent = normalizeWorkspaceDebugEvent(input);
  const current = readWorkspaceDebugTrail();
  writeWorkspaceDebugTrail([...current, nextEvent]);
  return nextEvent;
}

export function clearWorkspaceDebugTrail() {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(WORKSPACE_DEBUG_STORAGE_KEY);
  } catch {}
}

export const workspaceDebugTrailSchema = z
  .array(workspaceDebugEventSchema)
  .max(MAX_DEBUG_EVENTS);
