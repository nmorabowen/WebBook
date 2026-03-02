import { NextResponse } from "next/server";
import { getNote, updateNote } from "@/lib/content/service";

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
