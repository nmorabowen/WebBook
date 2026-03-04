import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { duplicateChapter } from "@/lib/content/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterSlug: string }> },
) {
  await requireSession();
  const { bookSlug, chapterSlug } = await params;
  return NextResponse.json(await duplicateChapter(bookSlug, chapterSlug), {
    status: 201,
  });
}
