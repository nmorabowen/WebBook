import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  updateUserAssignments,
  updateUserAssignmentsSchema,
} from "@/lib/user-store";

export async function PUT(
  request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }

  try {
    const { username } = await context.params;
    const payload = updateUserAssignmentsSchema.parse(await request.json());
    const user = await updateUserAssignments(username, payload);
    return NextResponse.json(user);
  } catch (error) {
    return apiError(400, error, "Could not update user assignments");
  }
}
