import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  appendErrorLog,
  getErrorLogFilePath,
  listErrorLogs,
} from "@/lib/error-log";
import { workspaceDebugTrailSchema } from "@/lib/workspace-debug";

const createErrorLogSchema = z.object({
  message: z.string().trim().max(4_000),
  digest: z.string().trim().max(400).nullish(),
  stack: z.string().max(20_000).nullish(),
  pathname: z.string().trim().max(1_000).nullish(),
  source: z.string().trim().max(200).nullish(),
  debugTrail: workspaceDebugTrailSchema.optional(),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const parsedLimit = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(parsedLimit) ? parsedLimit : 20;
  const entries = await listErrorLogs(limit);

  return NextResponse.json({
    entries,
    logFilePath: getErrorLogFilePath(),
  });
}

export async function POST(request: Request) {
  const session = await requireSession();

  try {
    const payload = createErrorLogSchema.parse(await request.json());
    const entry = await appendErrorLog({
      username: session.username,
      role: session.role,
      message: payload.message,
      digest: payload.digest ?? null,
      stack: payload.stack ?? null,
      pathname: payload.pathname ?? null,
      source: payload.source ?? null,
      userAgent: request.headers.get("user-agent"),
      debugTrail: payload.debugTrail ?? [],
    });

    return NextResponse.json({
      entry,
      canViewLogs: session.role === "admin",
    });
  } catch (error) {
    return apiError(400, error, "Could not record the error log");
  }
}
