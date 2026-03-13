import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getContentById, publishContentById } from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  canAccessContentRecord,
} from "@/lib/workspace-access";

const schema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await requireSession();
  const input = schema.parse(await request.json());
  const contentRecord = await getContentById(input.id);
  if (!contentRecord) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessContentRecord(scope, contentRecord)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const content = await publishContentById(input.id, true);
  return NextResponse.json(content);
}
