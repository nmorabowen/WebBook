import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getContentById, getPublicBook, getPublicChapter, getPublicNote } from "@/lib/content/service";
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
  const content = session
    ? await getContentById(input.pageId)
    : await (async () => {
        const [kind, location] = input.pageId.split(":");
        if (kind === "note") {
          return getPublicNote(location);
        }
        if (kind === "book") {
          return getPublicBook(location);
        }
        if (kind === "chapter") {
          const [bookSlug = "", ...chapterPath] = location.split("/").filter(Boolean);
          const result = await getPublicChapter(bookSlug, chapterPath);
          return result?.chapter ?? null;
        }
        return null;
      })();

  if (!content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (requester === "public") {
    if (content.kind === "note" && !content.meta.allowExecution) {
      return NextResponse.json(
        { error: "Execution is disabled for this note." },
        { status: 403 },
      );
    }
    if (content.kind === "chapter" && !content.meta.allowExecution) {
      return NextResponse.json(
        { error: "Execution is disabled for this chapter." },
        { status: 403 },
      );
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "127.0.0.1";
    const allowed = await enforcePublicExecutionLimit(ip);
    if (!allowed.ok) {
      return NextResponse.json(
        {
          error: `Rate limit reached. Try again in ${allowed.retryAfter} seconds.`,
        },
        { status: 429 },
      );
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
