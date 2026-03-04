import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { reorderBooks } from "@/lib/content/service";

export async function POST(request: Request) {
  await requireSession();
  const tree = await reorderBooks(await request.json());
  return NextResponse.json(tree);
}
