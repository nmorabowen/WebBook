import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { getWorkspaceStorageLayout } from "@/lib/env";
import {
  workspaceDebugTrailSchema,
  type WorkspaceDebugEvent,
} from "@/lib/workspace-debug";

const ERROR_LOG_FILE_NAME = "errors.jsonl";
const DEFAULT_ERROR_SOURCE = "workspace-error-boundary";
const MAX_MESSAGE_LENGTH = 1_200;
const MAX_STACK_LENGTH = 12_000;
const MAX_PATH_LENGTH = 600;
const MAX_SOURCE_LENGTH = 120;
const MAX_DIGEST_LENGTH = 200;
const MAX_USER_AGENT_LENGTH = 600;

export const errorLogEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  username: z.string(),
  role: z.enum(["admin", "editor"]),
  source: z.string(),
  pathname: z.string().nullable(),
  message: z.string(),
  digest: z.string().nullable(),
  stack: z.string().nullable(),
  userAgent: z.string().nullable(),
  debugTrail: workspaceDebugTrailSchema.default([]),
});

export type ErrorLogEntry = z.infer<typeof errorLogEntrySchema>;

type AppendErrorLogInput = {
  username: string;
  role: ErrorLogEntry["role"];
  message: string;
  pathname?: string | null;
  digest?: string | null;
  stack?: string | null;
  userAgent?: string | null;
  source?: string | null;
  debugTrail?: WorkspaceDebugEvent[];
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

function normalizeRequiredText(
  value: string | null | undefined,
  maxLength: number,
  fallback: string,
) {
  return normalizeOptionalText(value, maxLength) ?? fallback;
}

export function getErrorLogFilePath() {
  const { systemRoot } = getWorkspaceStorageLayout();
  return path.join(systemRoot, ERROR_LOG_FILE_NAME);
}

export async function appendErrorLog(input: AppendErrorLogInput) {
  const entry = errorLogEntrySchema.parse({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    username: input.username,
    role: input.role,
    source: normalizeRequiredText(
      input.source,
      MAX_SOURCE_LENGTH,
      DEFAULT_ERROR_SOURCE,
    ),
    pathname: normalizeOptionalText(input.pathname, MAX_PATH_LENGTH),
    message: normalizeRequiredText(
      input.message,
      MAX_MESSAGE_LENGTH,
      "Unknown workspace error",
    ),
    digest: normalizeOptionalText(input.digest, MAX_DIGEST_LENGTH),
    stack: normalizeOptionalText(input.stack, MAX_STACK_LENGTH),
    userAgent: normalizeOptionalText(input.userAgent, MAX_USER_AGENT_LENGTH),
    debugTrail: workspaceDebugTrailSchema.parse(input.debugTrail ?? []),
  });

  const filePath = getErrorLogFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

export async function listErrorLogs(limit = 20) {
  const filePath = getErrorLogFilePath();
  const clampedLimit = Math.max(1, Math.min(limit, 100));

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line);
          const result = errorLogEntrySchema.safeParse(parsed);
          return result.success ? [result.data] : [];
        } catch {
          return [];
        }
      });

    return entries.slice(-clampedLimit).reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
