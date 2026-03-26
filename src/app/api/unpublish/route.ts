import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";
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
    return apiError(404, "Not found");
  }
  const scope = await buildWorkspaceAccessScope(session);
  if (!canAccessContentRecord(scope, contentRecord)) {
    return apiError(404, "Not found");
  }
  const content = await publishContentById(input.id, false);
  return NextResponse.json(content);
}
