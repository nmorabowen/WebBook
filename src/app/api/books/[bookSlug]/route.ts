import { NextResponse } from "next/server";
import { deleteBook, getBook, updateBook } from "@/lib/content/service";

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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const { bookSlug } = await params;
  await deleteBook(bookSlug);
  return NextResponse.json({ ok: true });
}
