import { NextResponse } from "next/server";
import { reorderBooks } from "@/lib/content/service";

export async function POST(request: Request) {
  const tree = await reorderBooks(await request.json());
  return NextResponse.json(tree);
}
