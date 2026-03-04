import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteChapter, getChapter, updateChapter } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterSlug: string }> },
) {
  await requireSession();
  const { bookSlug, chapterSlug } = await params;
  return NextResponse.json(await getChapter(bookSlug, chapterSlug));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterSlug: string }> },
) {
  await requireSession();
  const { bookSlug, chapterSlug } = await params;
  return NextResponse.json(
    await updateChapter(bookSlug, chapterSlug, await request.json()),
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterSlug: string }> },
) {
  await requireSession();
  try {
    const { bookSlug, chapterSlug } = await params;
    await deleteChapter(bookSlug, chapterSlug);
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
