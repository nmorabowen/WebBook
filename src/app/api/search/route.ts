import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchContent, searchPublicContent } from "@/lib/content/service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  if (!query) {
    return NextResponse.json([]);
  }

  const session = await getSession();
  return NextResponse.json(
    session ? await searchContent(query) : await searchPublicContent(query),
  );
}
