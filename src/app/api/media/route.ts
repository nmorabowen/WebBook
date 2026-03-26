import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  getMediaReferences,
  removeMediaAsset,
  renameMediaAsset,
} from "@/lib/content/service";
import {
  buildWorkspaceAccessScope,
  canAccessMediaReference,
} from "@/lib/workspace-access";

function statusFromError(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return 400;
}

export async function DELETE(request: Request) {
  const session = await requireSession();

  const body = (await request.json().catch(() => null)) as
    | { url?: string; force?: boolean }
    | null;
  const url = body?.url?.trim();
  if (!url) {
    return apiError(400, "Missing media URL");
  }

  try {
    const scope = await buildWorkspaceAccessScope(session);
    if (!scope.isAdmin) {
      const references = await getMediaReferences(url);
      if (
        references.length === 0 ||
        references.some((reference) => !canAccessMediaReference(scope, reference))
      ) {
        return apiError(404, "Not found");
      }
    }
    const result = await removeMediaAsset(url, body?.force === true);
    if (result.blocked) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          references: result.references,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      blocked: false,
      references: result.references,
    });
  } catch (error) {
    return apiError(400, error, "Media removal failed");
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession();

  const body = (await request.json().catch(() => null)) as
    | { url?: string; newBaseName?: string; rewriteReferences?: boolean }
    | null;
  const url = body?.url?.trim();
  const newBaseName = body?.newBaseName?.trim();
  if (!url || !newBaseName) {
    return apiError(400, "Missing media URL or target name");
  }

  try {
    const scope = await buildWorkspaceAccessScope(session);
    if (!scope.isAdmin) {
      const references = await getMediaReferences(url);
      if (
        references.length === 0 ||
        references.some((reference) => !canAccessMediaReference(scope, reference))
      ) {
        return apiError(404, "Not found");
      }
    }
    const result = await renameMediaAsset(
      url,
      newBaseName,
      body?.rewriteReferences !== false,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(statusFromError(error), error, "Media rename failed");
  }
}
