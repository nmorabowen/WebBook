import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteNote, getNote, updateNote } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireSession();
  const { slug } = await params;
  return NextResponse.json(await getNote(slug));
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireSession();
  const { slug } = await params;
  return NextResponse.json(await updateNote(slug, await request.json()));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireSession();
  const { slug } = await params;
  await deleteNote(slug);
  return NextResponse.json({ ok: true });
}
