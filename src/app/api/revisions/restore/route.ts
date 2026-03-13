import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getContentById, restoreRevision } from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  canAccessContentRecord,
} from "@/lib/workspace-access";

export async function POST(request: Request) {
  const session = await requireSession();
  const payload = (await request.json()) as { id?: string };
  if (!payload.id) {
    return NextResponse.json({ error: "Missing content id" }, { status: 400 });
  }
  const currentContent = await getContentById(payload.id);
  if (!currentContent) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessContentRecord(scope, currentContent)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const content = await restoreRevision(payload);
  return NextResponse.json(content);
}
