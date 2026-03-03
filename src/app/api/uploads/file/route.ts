import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getGeneralSettings } from "@/lib/content/service";
import { env } from "@/lib/env";

function toSafeBaseName(fileName: string) {
  const normalized = fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "file";
}

function toSafeExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return extension || "";
}

function normalizeTargetPath(input: string) {
  return input
    .split(/[\\/]+/)
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);
}

export async function POST(request: Request) {
  await requireSession();
  const settings = await getGeneralSettings();

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file upload" }, { status: 400 });
  }

  const maxBytes = settings.fileUploadLimitMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File exceeds ${settings.fileUploadLimitMb}MB limit` },
      { status: 400 },
    );
  }

  const targetPathInput = String(formData.get("targetPath") ?? "");
  const targetSegments = normalizeTargetPath(targetPathInput);
  const uploadsRoot = path.join(
    process.cwd(),
    env.contentRoot,
    ".webbook",
    "uploads",
  );
  const directory = path.join(uploadsRoot, ...targetSegments);
  await fs.mkdir(directory, { recursive: true });

  const safeBaseName = toSafeBaseName(file.name);
  const extension = toSafeExtension(file.name);
  const fileName = `${safeBaseName}-${randomUUID().slice(0, 8)}${extension}`;
  const filePath = path.join(directory, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const mediaPath = [...targetSegments, fileName].join("/");
  return NextResponse.json({
    ok: true,
    url: `/media/${mediaPath}`,
    fileName,
    originalName: file.name,
  });
}
