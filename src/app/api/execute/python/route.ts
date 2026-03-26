import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { getSession } from "@/lib/auth";
import { getContentById, getPublicChapter } from "@/lib/content/service";
import { createRequestKey, executePython } from "@/lib/execution";
import { enforcePublicExecutionLimit, getExecutionCache, setExecutionCache } from "@/lib/rate-limit";

const executionSchema = z.object({
  cellId: z.string().min(1),
  source: z.string().min(1),
  pageId: z.string().min(1),
  requester: z.enum(["admin", "public"]).default("public"),
});

export async function POST(request: Request) {
  const input = executionSchema.parse(await request.json());
  const session = await getSession();
  const requester = session ? "admin" : input.requester;
  const content = await getContentById(input.pageId);

  if (!content) {
    return apiError(404, "Content not found");
  }

  if (requester === "public") {
    if (content.kind === "book" && content.meta.status !== "published") {
      return apiError(404, "Content not found");
    }
    if (content.kind === "note" && content.meta.status !== "published") {
      return apiError(404, "Content not found");
    }
    if (content.kind === "chapter") {
      const publicChapter = await getPublicChapter(content.meta.bookSlug, content.path);
      if (!publicChapter) {
        return apiError(404, "Content not found");
      }
    }
    if (content.kind === "note" && !content.meta.allowExecution) {
      return apiError(403, "Execution is disabled for this note.");
    }
    if (content.kind === "chapter" && !content.meta.allowExecution) {
      return apiError(403, "Execution is disabled for this chapter.");
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "127.0.0.1";
    const allowed = await enforcePublicExecutionLimit(ip);
    if (!allowed.ok) {
      return apiError(429, `Rate limit reached. Try again in ${allowed.retryAfter} seconds.`);
    }
  }

  const requestKey = createRequestKey({
    cellId: input.cellId,
    pageId: input.pageId,
    source: input.source,
  });
  const cached = await getExecutionCache<Awaited<ReturnType<typeof executePython>>>(requestKey);
  if (cached) {
    return NextResponse.json({
      ...cached,
      cached: true,
    });
  }

  const response = await executePython({
    ...input,
    requester,
    requestKey,
  });
  await setExecutionCache(requestKey, response);
  return NextResponse.json(response);
}
