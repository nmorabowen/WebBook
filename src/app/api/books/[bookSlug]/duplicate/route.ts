import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  duplicateBook,
  getBook,
  isMissingWorkspaceContentError,
} from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const session = await requireSession();
  const { bookSlug } = await params;
  try {
    const book = await getBook(bookSlug);
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessBook(scope, book)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(await duplicateBook(bookSlug), { status: 201 });
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Book duplication failed",
      },
      { status: 400 },
    );
  }
}
