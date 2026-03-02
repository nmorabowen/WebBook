import { NextResponse } from "next/server";
import { getChapter, updateChapter } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterSlug: string }> },
) {
  const { bookSlug, chapterSlug } = await params;
  return NextResponse.json(await getChapter(bookSlug, chapterSlug));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterSlug: string }> },
) {
  const { bookSlug, chapterSlug } = await params;
  return NextResponse.json(
    await updateChapter(bookSlug, chapterSlug, await request.json()),
  );
}
