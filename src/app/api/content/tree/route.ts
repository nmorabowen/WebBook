import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getContentTree, getPublicContentTree } from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  filterContentTreeForScope,
} from "@/lib/workspace-access";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(await getPublicContentTree());
  }

  const tree = await getContentTree();
  const scope = await buildWorkspaceAccessScope(session, tree);
  return NextResponse.json(filterContentTreeForScope(tree, scope));
}
