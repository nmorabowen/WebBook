import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  getBook,
  getNote,
  isMissingWorkspaceContentError,
  moveNoteToBook,
} from "@/lib/content/service";
import { checkContentRevision } from "@/lib/content/revision-check";
import {
  buildWorkspaceAccessScope,
  canAccessBook,
  canAccessNote,
} from "@/lib/workspace-access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await requireSession();
  try {
    const { slug } = await params;
    const note = await getNote(slug);
    if (!note) {
      return apiError(404, "Not found");
    }
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessNote(scope, note)) {
      return apiError(404, "Not found");
    }
    if (session.role !== "admin") {
      return apiError(403, "Forbidden");
    }
    const payload = await request.json();
    const staleResponse = await checkContentRevision(payload);
    if (staleResponse) return staleResponse;
    const destinationBook = await getBook(String(payload?.destinationBookSlug ?? ""));
    if (!canAccessBook(scope, destinationBook)) {
      return apiError(404, "Not found");
    }
    return NextResponse.json(await moveNoteToBook(slug, payload));
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return apiError(404, "Not found");
    }
    return apiError(400, error, "Unable to move this note.");
  }
}
