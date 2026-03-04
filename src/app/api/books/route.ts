import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createBook } from "@/lib/content/service";

export async function POST(request: Request) {
  await requireSession();
  const book = await createBook(await request.json());
  return NextResponse.json(book, { status: 201 });
}
