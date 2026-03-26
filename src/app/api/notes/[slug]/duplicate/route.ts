import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { duplicateNote, getNote } from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessNote } from "@/lib/workspace-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await requireSession();
  const { slug } = await params;
  const note = await getNote(slug);
  if (!note) {
    return apiError(404, "Not found");
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessNote(scope, note)) {
    return apiError(404, "Not found");
  }
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  return NextResponse.json(await duplicateNote(slug), { status: 201 });
}
