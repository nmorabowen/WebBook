import { NextResponse } from "next/server";
import { createBook } from "@/lib/content/service";

export async function POST(request: Request) {
  const book = await createBook(await request.json());
  return NextResponse.json(book, { status: 201 });
}
