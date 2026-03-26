import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { reorderNotes } from "@/lib/content/service";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  try {
    const tree = await reorderNotes(await request.json());
    return NextResponse.json(tree);
  } catch (error) {
    return apiError(400, error, "Note reorder failed");
  }
}
