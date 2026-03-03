import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";

const EXPORT_MANIFEST_FILE = "webbook-export.json";
const EXPORT_CONTENT_PREFIX = "content/";
const EXPORT_FORMAT = "webbook-workspace";
const EXPORT_VERSION = 1;

type ExportManifest = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
};

async function addDirectoryToZip(
  zip: JSZip,
  directoryPath: string,
  zipPrefix: string,
) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(directoryPath, entry.name);
    const zipPath = `${zipPrefix}${entry.name}`;

    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, sourcePath, `${zipPath}/`);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    zip.file(zipPath, await fs.readFile(sourcePath));
  }
}

function normalizeZipRelativePath(fileName: string) {
  if (!fileName.startsWith(EXPORT_CONTENT_PREFIX)) {
    return null;
  }

  const relativePath = fileName.slice(EXPORT_CONTENT_PREFIX.length);
  if (!relativePath) {
    return null;
  }

  const normalizedRelativePath = path.posix.normalize(relativePath);
  if (
    normalizedRelativePath.startsWith("../") ||
    normalizedRelativePath === ".." ||
    path.isAbsolute(normalizedRelativePath)
  ) {
    throw new Error("Archive contains an unsafe path");
  }

  return normalizedRelativePath;
}

async function replaceDirectoryAtomically(
  destinationPath: string,
  stagingPath: string,
  backupPath: string,
) {
  let destinationExists = false;
  try {
    await fs.access(destinationPath);
    destinationExists = true;
  } catch {}

  if (destinationExists) {
    await fs.rename(destinationPath, backupPath);
  }

  try {
    await fs.rename(stagingPath, destinationPath);
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true });
    if (destinationExists) {
      await fs.rename(backupPath, destinationPath);
    }
    throw error;
  }

  if (destinationExists) {
    await fs.rm(backupPath, { recursive: true, force: true });
  }
}

export async function buildWorkspaceArchive(contentRoot: string) {
  const zip = new JSZip();
  const manifest: ExportManifest = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
  };

  zip.file(EXPORT_MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  await addDirectoryToZip(zip, contentRoot, EXPORT_CONTENT_PREFIX);

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

export async function restoreWorkspaceArchive(
  archiveBuffer: Buffer,
  contentRoot: string,
) {
  const zip = await JSZip.loadAsync(archiveBuffer);
  const manifestRaw = await zip.file(EXPORT_MANIFEST_FILE)?.async("string");
  if (!manifestRaw) {
    throw new Error("Archive manifest is missing");
  }

  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(manifestRaw) as ExportManifest;
  } catch {
    throw new Error("Archive manifest is invalid");
  }

  if (manifest.format !== EXPORT_FORMAT || manifest.version !== EXPORT_VERSION) {
    throw new Error("Archive format is unsupported");
  }

  const parentDirectory = path.dirname(contentRoot);
  const directoryName = path.basename(contentRoot);
  const stagingPath = path.join(parentDirectory, `.${directoryName}-import-${Date.now()}`);
  const backupPath = path.join(parentDirectory, `.${directoryName}-backup-${Date.now()}`);

  await fs.mkdir(stagingPath, { recursive: true });

  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  let wroteFile = false;

  for (const file of files) {
    const relativePath = normalizeZipRelativePath(file.name);
    if (!relativePath) {
      continue;
    }

    wroteFile = true;
    const destinationFile = path.join(stagingPath, relativePath);
    const destinationDirectory = path.dirname(destinationFile);
    await fs.mkdir(destinationDirectory, { recursive: true });
    await fs.writeFile(destinationFile, await file.async("nodebuffer"));
  }

  if (!wroteFile) {
    await fs.rm(stagingPath, { recursive: true, force: true });
    throw new Error("Archive does not contain any workspace files");
  }

  await replaceDirectoryAtomically(contentRoot, stagingPath, backupPath);
}
