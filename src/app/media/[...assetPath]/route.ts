import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getWorkspaceStorageLayout } from "@/lib/env";

const mimeTypes = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".avif", "image/avif"],
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetPath: string[] }> },
) {
  const { assetPath } = await params;
  const { uploads: uploadsRoot } = getWorkspaceStorageLayout();
  const resolvedPath = path.resolve(uploadsRoot, ...assetPath);

  if (!resolvedPath.startsWith(path.resolve(uploadsRoot))) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const buffer = await fs.readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
