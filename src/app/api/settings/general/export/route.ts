import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import { exportWorkspaceArchive } from "@/lib/content/service";
import { WorkspaceArchiveTooLargeError } from "@/lib/workspace-transfer";

export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }

  try {
    const archive = await exportWorkspaceArchive();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    return new NextResponse(new Uint8Array(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="webbook-workspace-${timestamp}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error instanceof WorkspaceArchiveTooLargeError ? 413 : 500, error, "Could not export the workspace");
  }
}
