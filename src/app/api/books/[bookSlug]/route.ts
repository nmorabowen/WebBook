import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import {
  appendContentEditActivity,
  buildActivityLogContent,
  createActivityActor,
} from "@/lib/activity-log";
import { requireSession } from "@/lib/auth";
import {
  deleteBook,
  getBook,
  isMissingWorkspaceContentError,
  updateBook,
} from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

export async function GET(
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
    return NextResponse.json(book);
  } catch {
    return apiError(404, "Not found");
  }
}

export async function PUT(
  request: Request,
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
    const updatedBook = await updateBook(bookSlug, await request.json());
    await appendContentEditActivity({
      actor: createActivityActor(session),
      content: buildActivityLogContent(updatedBook),
    }).catch(() => undefined);
    return NextResponse.json(updatedBook);
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return apiError(404, "Not found");
    }
    return apiError(400, error, "Book update failed");
  }
}

export async function DELETE(
  _request: Request,
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
    if (session.role !== "admin") {
      return apiError(403, "Forbidden");
    }
    await deleteBook(bookSlug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return apiError(404, "Not found");
    }
    return apiError(400, error, "Book deletion failed");
  }
}
