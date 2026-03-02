import { NextResponse } from "next/server";
import { reorderBookChapters } from "@/lib/content/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const { bookSlug } = await params;
  return NextResponse.json(
    await reorderBookChapters(bookSlug, await request.json()),
  );
}
