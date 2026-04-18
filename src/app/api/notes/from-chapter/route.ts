import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  getBook,
  isMissingWorkspaceContentError,
  moveChapterToNote,
} from "@/lib/content/service";
import { checkContentRevision } from "@/lib/content/revision-check";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  try {
    const payload = await request.json();
    const staleResponse = await checkContentRevision(payload);
    if (staleResponse) return staleResponse;

    const sourceBook = await getBook(String(payload?.bookSlug ?? ""));
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessBook(scope, sourceBook)) {
      return apiError(404, "Not found");
    }
    return NextResponse.json(await moveChapterToNote(payload));
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return apiError(404, "Not found");
    }
    return apiError(400, error, "Unable to demote this chapter to a note.");
  }
}
