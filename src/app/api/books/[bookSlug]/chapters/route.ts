import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  createChapter,
  getBook,
  isMissingWorkspaceContentError,
} from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const session = await requireSession();
  try {
    const { bookSlug } = await params;
    const book = await getBook(bookSlug);
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessBook(scope, book)) {
      return apiError(404, "Not found");
    }
    return NextResponse.json(await createChapter(bookSlug, await request.json()), {
      status: 201,
    });
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return apiError(404, "Not found");
    }
    return apiError(400, error, "Chapter creation failed");
  }
}
