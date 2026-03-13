import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  createChapter,
  getBook,
  isMissingWorkspaceContentError,
} from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const session = await requireSession();
  try {
    const { bookSlug } = await params;
    const book = await getBook(bookSlug);
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessBook(scope, book)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(await createChapter(bookSlug, await request.json()), {
      status: 201,
    });
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Chapter creation failed",
      },
      { status: 400 },
    );
  }
}
