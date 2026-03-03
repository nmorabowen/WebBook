import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { removeMediaAsset } from "@/lib/content/service";

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
