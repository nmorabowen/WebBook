import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchContent, searchPublicContent } from "@/lib/content/service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const scope = searchParams.get("scope") ?? "auto";
  if (!query) {
    return NextResponse.json([]);
  }

  const session = await getSession();
  if (scope === "public") {
    return NextResponse.json(await searchPublicContent(query));
  }

  if (scope === "workspace") {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await searchContent(query));
  }

  return NextResponse.json(
    session ? await searchContent(query) : await searchPublicContent(query),
  );
}
