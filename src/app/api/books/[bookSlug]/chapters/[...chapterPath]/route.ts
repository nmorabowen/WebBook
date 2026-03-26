import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import {
  appendContentEditActivity,
  buildActivityLogContent,
  createActivityActor,
} from "@/lib/activity-log";
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
    return apiError(404, "Not found");
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessChapter(scope, chapter)) {
    return apiError(404, "Not found");
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
      return apiError(404, "Not found");
    }
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessChapter(scope, chapter)) {
      return apiError(404, "Not found");
    }
    const updatedChapter = await updateChapterContent(
      bookSlug,
      chapterPath ?? [],
      await request.json(),
    );
    await appendContentEditActivity({
      actor: createActivityActor(session),
      content: buildActivityLogContent(updatedChapter),
    }).catch(() => undefined);
    return NextResponse.json(updatedChapter);
  } catch (error) {
    return apiError(400, error, "Chapter update failed");
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
      return apiError(404, "Not found");
    }
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessChapter(scope, chapter)) {
      return apiError(404, "Not found");
    }
    await deleteChapter(bookSlug, chapterPath ?? []);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(400, error, "Chapter deletion failed");
  }
}
