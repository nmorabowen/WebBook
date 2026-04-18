import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { repairOrphans } from "@/lib/content/service";

/**
 * Admin-only sweeper for `.chapters-backup-*` and `.chapters-<op>-*` orphan
 * directories left behind by interrupted transactional moves. Returns the
 * scan report so the operator can see exactly what was restored or removed.
 */
export async function POST() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }

  try {
    const report = await repairOrphans();
    return NextResponse.json(report);
  } catch (error) {
    return apiError(500, error, "Could not repair orphan directories");
  }
}
