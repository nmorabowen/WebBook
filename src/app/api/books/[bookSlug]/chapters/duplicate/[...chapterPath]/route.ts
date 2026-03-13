import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { duplicateChapter, getChapter } from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessChapter } from "@/lib/workspace-access";

export async function POST(
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
  return NextResponse.json(await duplicateChapter(bookSlug, chapterPath ?? []), {
    status: 201,
  });
}
