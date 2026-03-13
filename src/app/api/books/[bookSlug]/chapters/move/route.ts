import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getBook,
  isMissingWorkspaceContentError,
  moveChapter,
} from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const session = await requireSession();
  try {
    const { bookSlug } = await params;
    const sourceBook = await getBook(bookSlug);
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessBook(scope, sourceBook)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const payload = await request.json();
    const destinationBook = await getBook(String(payload?.destinationBookSlug ?? bookSlug));
    if (!canAccessBook(scope, destinationBook)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(await moveChapter(bookSlug, payload));
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chapter move failed",
      },
      { status: 400 },
    );
  }
}
