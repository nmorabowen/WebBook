import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { reorderNotes } from "@/lib/content/service";

export async function POST(request: Request) {
  await requireSession();
  const tree = await reorderNotes(await request.json());
  return NextResponse.json(tree);
}
