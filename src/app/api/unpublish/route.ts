import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { publishContentById } from "@/lib/content/service";

const schema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  await requireSession();
  const input = schema.parse(await request.json());
  const content = await publishContentById(input.id, false);
  return NextResponse.json(content);
}
