import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  setSessionCookie,
  verifyCredentials,
} from "@/lib/auth";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const input = loginSchema.parse(await request.json());
  const user = await verifyCredentials(input.username, input.password);

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken({
    username: user.username,
    role: user.role,
  });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
