import { NextResponse } from "next/server";
import { getContentRevision } from "@/lib/content/service";

/**
 * Optimistic-concurrency check for mutation APIs.
 *
 * If the payload carries a `revision` that no longer matches the current
 * content revision, return a 409 so the client can reload and retry.
 * If no revision is provided, skip the check (back-compat for older clients).
 *
 * Returns `null` when the request may proceed, or a NextResponse to return.
 */
export async function checkContentRevision(
  payload: unknown,
): Promise<NextResponse | null> {
  const revision =
    payload && typeof payload === "object" && "revision" in payload
      ? (payload as { revision?: unknown }).revision
      : undefined;
  if (typeof revision !== "string" || revision.length === 0) {
    return null;
  }
  const current = await getContentRevision();
  if (revision === current) {
    return null;
  }
  return NextResponse.json(
    {
      error:
        "Content has changed since you loaded it. Reload and try again.",
      code: "REVISION_MISMATCH",
      currentRevision: current,
    },
    { status: 409 },
  );
}
