import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { moveContent } from "@/lib/content/service";
import { checkContentRevision } from "@/lib/content/revision-check";

/**
 * Phase-2 unified move endpoint. Dispatches every kind-specific move
 * (chapter cross-book, chapter nest, chapter -> root note, note ->
 * book/chapter chapter, note -> scoped notes folder) through the
 * service-layer moveContent dispatcher. Per-kind routes (/api/books/...
 * /api/notes/...) still work and stay live as compatibility shims.
 */
export async function POST(request: Request) {
  const session = await requireSession();
  try {
    const payload = await request.json();
    const staleResponse = await checkContentRevision(payload);
    if (staleResponse) return staleResponse;

    // Admin gate: any move that retargets across books/notes touches
    // workspace-level state. Editors can still hit per-kind routes that
    // already do their own scope checks.
    if (session.role !== "admin") {
      return apiError(403, "Forbidden");
    }

    const result = await moveContent(payload);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(400, error, "Move failed");
  }
}
