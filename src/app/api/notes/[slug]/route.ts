import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessNote(scope, note)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessNote(scope, note)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    return NextResponse.json(await updateNote(slug, await request.json()));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Note update failed",
      },
      { status: 400 },
    );
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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessNote(scope, note)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await deleteNote(slug);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Note deletion failed",
      },
      { status: 400 },
    );
  }
}
