import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { createNote } from "@/lib/content/service";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  try {
    const note = await createNote(await request.json());
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return apiError(400, error, "Note creation failed");
  }
}
