import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteChapter, getChapter, updateChapterContent } from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessChapter } from "@/lib/workspace-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterPath: string[] }> },
) {
  const session = await requireSession();
  const { bookSlug, chapterPath } = await params;
  const chapter = await getChapter(bookSlug, chapterPath ?? []);
  if (!chapter) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessChapter(scope, chapter)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(chapter);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterPath: string[] }> },
) {
  const session = await requireSession();
  try {
    const { bookSlug, chapterPath } = await params;
    const chapter = await getChapter(bookSlug, chapterPath ?? []);
    if (!chapter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessChapter(scope, chapter)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      await updateChapterContent(bookSlug, chapterPath ?? [], await request.json()),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chapter update failed",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterPath: string[] }> },
) {
  const session = await requireSession();
  try {
    const { bookSlug, chapterPath } = await params;
    const chapter = await getChapter(bookSlug, chapterPath ?? []);
    if (!chapter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessChapter(scope, chapter)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await deleteChapter(bookSlug, chapterPath ?? []);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chapter deletion failed",
      },
      { status: 400 },
    );
  }
}
