import { NextResponse } from "next/server";
import { getContentTree } from "@/lib/content/service";

export async function GET() {
  return NextResponse.json(await getContentTree());
}
