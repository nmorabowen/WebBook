import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createBook } from "@/lib/content/service";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const book = await createBook(await request.json());
    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Book creation failed",
      },
      { status: 400 },
    );
  }
}
