import { NextResponse } from "next/server";
import { createChapter } from "@/lib/content/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const { bookSlug } = await params;
  return NextResponse.json(await createChapter(bookSlug, await request.json()), {
    status: 201,
  });
}
