import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { duplicateBook } from "@/lib/content/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  await requireSession();
  const { bookSlug } = await params;
  return NextResponse.json(await duplicateBook(bookSlug), { status: 201 });
}
