import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { exportWorkspaceArchive } from "@/lib/content/service";
import { WorkspaceArchiveTooLargeError } from "@/lib/workspace-transfer";

export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const message = error instanceof Error ? error.message : "Could not export the workspace";
    return NextResponse.json(
      { error: message },
      { status: error instanceof WorkspaceArchiveTooLargeError ? 413 : 500 },
    );
  }
}
