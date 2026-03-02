import { NextResponse } from "next/server";
import { createNote } from "@/lib/content/service";

export async function POST(request: Request) {
  const note = await createNote(await request.json());
  return NextResponse.json(note, { status: 201 });
}
