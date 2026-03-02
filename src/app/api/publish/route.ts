import { NextResponse } from "next/server";
import { z } from "zod";
import { publishContentById } from "@/lib/content/service";

const schema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  const input = schema.parse(await request.json());
  const content = await publishContentById(input.id, true);
  return NextResponse.json(content);
}
