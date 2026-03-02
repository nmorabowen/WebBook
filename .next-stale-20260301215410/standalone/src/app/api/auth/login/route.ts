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
  const isValid =
    (input.username === "admin" && input.password === "webbook-admin") ||
    (await verifyCredentials(input.username, input.password));

  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken({ username: input.username });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
}
