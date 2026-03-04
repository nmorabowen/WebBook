import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { reorderBookChapters } from "@/lib/content/service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  await requireSession();
  const { bookSlug } = await params;
  return NextResponse.json(
    await reorderBookChapters(bookSlug, await request.json()),
  );
}
