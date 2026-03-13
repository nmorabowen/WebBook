import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { reorderBooks } from "@/lib/content/service";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const tree = await reorderBooks(await request.json());
    return NextResponse.json(tree);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Book reorder failed",
      },
      { status: 400 },
    );
  }
}
