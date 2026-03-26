import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { createUser, createUserSchema, listUsers } from "@/lib/user-store";

export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }

  const users = await listUsers();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }

  try {
    const payload = createUserSchema.parse(await request.json());
    const user = await createUser(payload);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return apiError(400, error, "Could not create user");
  }
}
