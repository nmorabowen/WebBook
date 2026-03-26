import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { changeOwnPassword, changeOwnPasswordSchema } from "@/lib/user-store";

export async function POST(request: Request) {
  const session = await requireSession();

  try {
    const payload = changeOwnPasswordSchema.parse(await request.json());
    await changeOwnPassword(
      session.username,
      payload.currentPassword,
      payload.nextPassword,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(400, error, "Could not update password");
  }
}
