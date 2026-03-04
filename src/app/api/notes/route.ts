import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createNote } from "@/lib/content/service";

export async function POST(request: Request) {
  await requireSession();
  try {
    const note = await createNote(await request.json());
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Note creation failed",
      },
      { status: 400 },
    );
  }
}
