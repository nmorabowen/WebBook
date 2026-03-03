import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getGeneralSettings } from "@/lib/content/service";
import { env } from "@/lib/env";

const allowedMimeTypes = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/jpg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
  ["image/svg+xml", ".svg"],
  ["image/avif", ".avif"],
]);

function toSafeBaseName(fileName: string) {
  const normalized = fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "image";
}

export async function POST(request: Request) {
  await requireSession();
  const settings = await getGeneralSettings();

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file upload" }, { status: 400 });
  }

  const extension = allowedMimeTypes.get(file.type);
  if (!extension) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  const maxBytes = settings.imageUploadLimitMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `Image exceeds ${settings.imageUploadLimitMb}MB limit` },
      { status: 400 },
    );
  }

  const uploadsRoot = path.join(
    process.cwd(),
    env.contentRoot,
    ".webbook",
    "uploads",
  );
  await fs.mkdir(uploadsRoot, { recursive: true });

  const timestamp = new Date().toISOString().slice(0, 10);
  const directory = path.join(uploadsRoot, timestamp);
  await fs.mkdir(directory, { recursive: true });

  const safeBaseName = toSafeBaseName(file.name);
  const fileName = `${safeBaseName}-${randomUUID().slice(0, 8)}${extension}`;
  const filePath = path.join(directory, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return NextResponse.json({
    ok: true,
    url: `/media/${timestamp}/${fileName}`,
    fileName,
    alt: safeBaseName.replace(/-/g, " "),
  });
}
