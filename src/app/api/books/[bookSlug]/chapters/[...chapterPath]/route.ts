import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteChapter, getChapter, updateChapterContent } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterPath: string[] }> },
) {
  await requireSession();
  const { bookSlug, chapterPath } = await params;
  return NextResponse.json(await getChapter(bookSlug, chapterPath ?? []));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterPath: string[] }> },
) {
  await requireSession();
  try {
    const { bookSlug, chapterPath } = await params;
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
  await requireSession();
  try {
    const { bookSlug, chapterPath } = await params;
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
