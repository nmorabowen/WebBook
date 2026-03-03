import { NextResponse } from "next/server";
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
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update password",
      },
      { status: 400 },
    );
  }
}
