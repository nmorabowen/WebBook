import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { duplicateNote } from "@/lib/content/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireSession();
  const { slug } = await params;
  return NextResponse.json(await duplicateNote(slug), { status: 201 });
}
