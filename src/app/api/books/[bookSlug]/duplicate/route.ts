import { NextResponse } from "next/server";
import { duplicateBook } from "@/lib/content/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const { bookSlug } = await params;
  return NextResponse.json(await duplicateBook(bookSlug), { status: 201 });
}
