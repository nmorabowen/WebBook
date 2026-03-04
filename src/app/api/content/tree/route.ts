import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getContentTree, getPublicContentTree } from "@/lib/content/service";

export async function GET() {
  const session = await getSession();
  return NextResponse.json(
    session ? await getContentTree() : await getPublicContentTree(),
  );
}
