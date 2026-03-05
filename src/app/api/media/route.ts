import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { removeMediaAsset, renameMediaAsset } from "@/lib/content/service";

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
  await requireSession();

  const body = (await request.json().catch(() => null)) as
    | { url?: string; force?: boolean }
    | null;
  const url = body?.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "Missing media URL" }, { status: 400 });
  }

  try {
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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Media removal failed",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  await requireSession();

  const body = (await request.json().catch(() => null)) as
    | { url?: string; newBaseName?: string; rewriteReferences?: boolean }
    | null;
  const url = body?.url?.trim();
  const newBaseName = body?.newBaseName?.trim();
  if (!url || !newBaseName) {
    return NextResponse.json(
      { error: "Missing media URL or target name" },
      { status: 400 },
    );
  }

  try {
    const result = await renameMediaAsset(
      url,
      newBaseName,
      body?.rewriteReferences !== false,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Media rename failed",
      },
      { status: statusFromError(error) },
    );
  }
}
