import { NextResponse } from "next/server";
import { deleteNote, getNote, updateNote } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return NextResponse.json(await getNote(slug));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return NextResponse.json(await updateNote(slug, await request.json()));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  await deleteNote(slug);
  return NextResponse.json({ ok: true });
}
