import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getGeneralSettings,
  updateGeneralSettings,
} from "@/lib/content/service";

export async function GET() {
  await requireSession();
  const settings = await getGeneralSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  await requireSession();
  const payload = await request.json();
  const settings = await updateGeneralSettings(payload);
  return NextResponse.json(settings);
}
