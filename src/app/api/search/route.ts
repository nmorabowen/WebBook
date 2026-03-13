import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getContentTree, searchContent, searchPublicContent } from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  filterSearchResultsForScope,
} from "@/lib/workspace-access";

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

    const tree = await getContentTree();
    const accessScope = await buildWorkspaceAccessScope(session, tree);
    return NextResponse.json(
      filterSearchResultsForScope(await searchContent(query), accessScope),
    );
  }

  if (!session) {
    return NextResponse.json(await searchPublicContent(query));
  }

  const tree = await getContentTree();
  const accessScope = await buildWorkspaceAccessScope(session, tree);
  return NextResponse.json(
    filterSearchResultsForScope(await searchContent(query), accessScope),
  );
}
