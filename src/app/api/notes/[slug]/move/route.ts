import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getBook,
  getNote,
  isMissingWorkspaceContentError,
  moveNoteToBook,
} from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  canAccessBook,
  canAccessNote,
} from "@/lib/workspace-access";

export async function POST(
  request: Request,
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
    const payload = await request.json();
    const destinationBook = await getBook(String(payload?.destinationBookSlug ?? ""));
    if (!canAccessBook(scope, destinationBook)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(await moveNoteToBook(slug, payload));
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to move this note." },
      { status: 400 },
    );
  }
}
