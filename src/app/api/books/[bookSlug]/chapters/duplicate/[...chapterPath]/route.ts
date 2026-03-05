import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { duplicateChapter } from "@/lib/content/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string; chapterPath: string[] }> },
) {
  await requireSession();
  const { bookSlug, chapterPath } = await params;
  return NextResponse.json(await duplicateChapter(bookSlug, chapterPath ?? []), {
    status: 201,
  });
}
