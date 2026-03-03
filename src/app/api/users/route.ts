import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createUser, createUserSchema, listUsers } from "@/lib/user-store";

export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await listUsers();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = createUserSchema.parse(await request.json());
    const user = await createUser(payload);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not create user",
      },
      { status: 400 },
    );
  }
}
