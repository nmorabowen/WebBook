import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  appendErrorLog,
  getErrorLogFilePath,
  listErrorLogs,
} from "@/lib/error-log";

const createErrorLogSchema = z.object({
  message: z.string().trim().max(4_000),
  digest: z.string().trim().max(400).nullish(),
  stack: z.string().max(20_000).nullish(),
  pathname: z.string().trim().max(1_000).nullish(),
  source: z.string().trim().max(200).nullish(),
});

export async function GET(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    });

    return NextResponse.json({
      entry,
      canViewLogs: session.role === "admin",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not record the error log",
      },
      { status: 400 },
    );
  }
}
