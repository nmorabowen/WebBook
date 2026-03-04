import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createChapter } from "@/lib/content/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  await requireSession();
  try {
    const { bookSlug } = await params;
    return NextResponse.json(await createChapter(bookSlug, await request.json()), {
      status: 201,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chapter creation failed",
      },
      { status: 400 },
    );
  }
}
