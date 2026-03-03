import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getGeneralSettings,
  updateGeneralSettings,
} from "@/lib/content/service";

export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getGeneralSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const payload = await request.json();
  const settings = await updateGeneralSettings(payload);
  return NextResponse.json(settings);
}
