import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { moveNoteToBook } from "@/lib/content/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireSession();
  try {
    const { slug } = await params;
    return NextResponse.json(await moveNoteToBook(slug, await request.json()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to move this note." },
      { status: 400 },
    );
  }
}
