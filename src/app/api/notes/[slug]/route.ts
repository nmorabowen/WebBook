import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import {
  appendContentEditActivity,
  buildActivityLogContent,
  createActivityActor,
} from "@/lib/activity-log";
import { requireSession } from "@/lib/auth";
import { deleteNote, getNote, updateNote } from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessNote } from "@/lib/workspace-access";

export async function GET(
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
  return NextResponse.json(note);
}

export async function PUT(
  request: Request,
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
  try {
    const updatedNote = await updateNote(slug, await request.json());
    if (updatedNote) {
      await appendContentEditActivity({
        actor: createActivityActor(session),
        content: buildActivityLogContent(updatedNote),
      }).catch(() => undefined);
    }
    return NextResponse.json(updatedNote);
  } catch (error) {
    return apiError(400, error, "Note update failed");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await requireSession();
  try {
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
    await deleteNote(slug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(400, error, "Note deletion failed");
  }
}
