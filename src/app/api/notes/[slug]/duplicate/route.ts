import { NextResponse } from "next/server";
import { duplicateNote } from "@/lib/content/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return NextResponse.json(await duplicateNote(slug), { status: 201 });
}
