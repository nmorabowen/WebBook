import { NextResponse } from "next/server";
import { duplicateChapter } from "@/lib/content/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterSlug: string }> },
) {
  const { bookSlug, chapterSlug } = await params;
  return NextResponse.json(await duplicateChapter(bookSlug, chapterSlug), {
    status: 201,
  });
}
