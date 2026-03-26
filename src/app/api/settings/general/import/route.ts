import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
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
    return apiError(403, "Forbidden");
  }

  const formData = await request.formData();
  const file = formData.get("archive");

  if (!(file instanceof File)) {
    return apiError(400, "Archive file is required");
  }

  const settings = await getGeneralSettings();
  const maxArchiveBytes = workspaceTransferLimitMbToBytes(
    settings.workspaceTransferLimitMb,
  );

  if (file.size > maxArchiveBytes) {
    const error = new WorkspaceArchiveTooLargeError(maxArchiveBytes);
    return apiError(413, error.message);
  }

  const archiveBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await importWorkspaceArchive(archiveBuffer);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error instanceof WorkspaceArchiveTooLargeError ? 413 : 400, error, "Could not import the workspace archive");
  }
}
