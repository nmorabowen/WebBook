import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { restoreRevision } from "@/lib/content/service";

export async function POST(request: Request) {
  await requireSession();
  const content = await restoreRevision(await request.json());
  return NextResponse.json(content);
}
