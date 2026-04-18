import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getContentRevision,
  getContentTree,
  getPublicContentTree,
} from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  filterContentTreeForScope,
} from "@/lib/workspace-access";

export async function GET() {
  const session = await getSession();
  if (!session) {
    const tree = await getPublicContentTree();
    return NextResponse.json({ tree, revision: await getContentRevision() });
  }

  const tree = await getContentTree();
  const scope = await buildWorkspaceAccessScope(session, tree);
  return NextResponse.json({
    tree: filterContentTreeForScope(tree, scope),
    revision: await getContentRevision(),
  });
}
