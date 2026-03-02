import { NextResponse } from "next/server";
import { restoreRevision } from "@/lib/content/service";

export async function POST(request: Request) {
  const content = await restoreRevision(await request.json());
  return NextResponse.json(content);
}
