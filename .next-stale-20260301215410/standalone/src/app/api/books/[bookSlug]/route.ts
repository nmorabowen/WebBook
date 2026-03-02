import { NextResponse } from "next/server";
import { getBook, updateBook } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const { bookSlug } = await params;
  return NextResponse.json(await getBook(bookSlug));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const { bookSlug } = await params;
  return NextResponse.json(await updateBook(bookSlug, await request.json()));
}
