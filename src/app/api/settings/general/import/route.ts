import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getGeneralSettings,
  importWorkspaceArchive,
} from "@/lib/content/service";
import {
  WorkspaceArchiveTooLargeError,
  workspaceTransferLimitMbToBytes,
} from "@/lib/workspace-transfer";

export async function POST(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("archive");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archive file is required" }, { status: 400 });
  }

  const settings = await getGeneralSettings();
  const maxArchiveBytes = workspaceTransferLimitMbToBytes(
    settings.workspaceTransferLimitMb,
  );

  if (file.size > maxArchiveBytes) {
    const error = new WorkspaceArchiveTooLargeError(maxArchiveBytes);
    return NextResponse.json({ error: error.message }, { status: 413 });
  }

  const archiveBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importWorkspaceArchive(archiveBuffer);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not import the workspace archive";
    return NextResponse.json(
      { error: message },
      { status: error instanceof WorkspaceArchiveTooLargeError ? 413 : 400 },
    );
  }
}
