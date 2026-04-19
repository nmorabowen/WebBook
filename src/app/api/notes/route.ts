import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { createNote } from "@/lib/content/service";

/**
 * Optional location envelope on the create payload. When present, the new
 * note is written into the corresponding scoped folder; otherwise it lands
 * at content/notes/ (root) for backward compatibility with Phase-1 callers.
 */
const noteLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("root") }),
  z.object({ kind: z.literal("book"), bookSlug: z.string().min(1) }),
  z.object({
    kind: z.literal("chapter"),
    bookSlug: z.string().min(1),
    chapterPath: z.array(z.string().min(1)).min(1),
  }),
]);

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  try {
    const payload = await request.json();
    const { location: rawLocation, ...notePayload } =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : { location: undefined };
    const location = rawLocation
      ? noteLocationSchema.parse(rawLocation)
      : undefined;
    const note = await createNote(notePayload, location);
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return apiError(400, error, "Note creation failed");
  }
}
