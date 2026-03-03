import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { exportWorkspaceArchive } from "@/lib/content/service";

export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
}
