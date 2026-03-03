import { NextResponse } from "next/server";
import { reorderNotes } from "@/lib/content/service";

export async function POST(request: Request) {
  const tree = await reorderNotes(await request.json());
  return NextResponse.json(tree);
}
