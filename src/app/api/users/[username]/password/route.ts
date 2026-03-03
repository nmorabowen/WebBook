import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { adminResetPasswordSchema, updateUserPassword } from "@/lib/user-store";

export async function PUT(
  request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { username } = await context.params;
    const payload = adminResetPasswordSchema.parse(await request.json());
    const user = await updateUserPassword(username, payload.password);
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update password",
      },
      { status: 400 },
    );
  }
}
