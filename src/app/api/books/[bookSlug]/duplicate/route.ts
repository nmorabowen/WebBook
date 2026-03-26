import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  duplicateBook,
  getBook,
  isMissingWorkspaceContentError,
} from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const session = await requireSession();
  const { bookSlug } = await params;
  try {
    const book = await getBook(bookSlug);
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessBook(scope, book)) {
      return apiError(404, "Not found");
    }
    if (session.role !== "admin") {
      return apiError(403, "Forbidden");
    }
    return NextResponse.json(await duplicateBook(bookSlug), { status: 201 });
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return apiError(404, "Not found");
    }
    return apiError(400, error, "Book duplication failed");
  }
}
