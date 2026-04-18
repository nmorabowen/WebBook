import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { reorderNotes } from "@/lib/content/service";
import { checkContentRevision } from "@/lib/content/revision-check";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  try {
    const payload = await request.json();
    const staleResponse = await checkContentRevision(payload);
    if (staleResponse) return staleResponse;
    const tree = await reorderNotes(payload);
    return NextResponse.json(tree);
  } catch (error) {
    return apiError(400, error, "Note reorder failed");
  }
}
