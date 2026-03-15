import { NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(book);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const updatedBook = await updateBook(bookSlug, await request.json());
    await appendContentEditActivity({
      actor: createActivityActor(session),
      content: buildActivityLogContent(updatedBook),
    }).catch(() => undefined);
    return NextResponse.json(updatedBook);
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Book update failed",
      },
      { status: 400 },
    );
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await deleteBook(bookSlug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Book deletion failed",
      },
      { status: 400 },
    );
  }
}
