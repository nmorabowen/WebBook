import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { requireSession } from "@/lib/auth";
import {
  getGeneralSettings,
  updateGeneralSettings,
} from "@/lib/content/service";

export async function GET() {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  const settings = await getGeneralSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (session.role !== "admin") {
    return apiError(403, "Forbidden");
  }
  const payload = await request.json();
  const settings = await updateGeneralSettings(payload);
  return NextResponse.json(settings);
}
