import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
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
    return apiError(400, "Missing content id");
  }
  const currentContent = await getContentById(payload.id);
  if (!currentContent) {
    return apiError(404, "Not found");
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessContentRecord(scope, currentContent)) {
    return apiError(404, "Not found");
  }
  const content = await restoreRevision(payload);
  return NextResponse.json(content);
}
