import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { moveChapter } from "@/lib/content/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  await requireSession();
  try {
    const { bookSlug } = await params;
    return NextResponse.json(await moveChapter(bookSlug, await request.json()));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chapter move failed",
      },
      { status: 400 },
    );
  }
}
