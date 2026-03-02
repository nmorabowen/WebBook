import { NextResponse } from "next/server";
import { searchContent } from "@/lib/content/service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  if (!query) {
    return NextResponse.json([]);
  }
  return NextResponse.json(await searchContent(query));
}
