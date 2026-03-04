import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";
import { DEFAULT_GENERAL_SETTINGS } from "@/lib/general-settings-config";

const EXPORT_MANIFEST_FILE = "webbook-export.json";
const EXPORT_CONTENT_PREFIX = "content/";
const EXPORT_FORMAT = "webbook-workspace";
const EXPORT_VERSION = 1;
const BYTES_PER_MEGABYTE = 1024 * 1024;

export function workspaceTransferLimitMbToBytes(limitMb: number) {
  return Math.round(limitMb * BYTES_PER_MEGABYTE);
}

export function formatWorkspaceArchiveTooLargeError(maxBytes: number) {
  const maxMegabytes = Math.max(
    1,
    Math.round(maxBytes / BYTES_PER_MEGABYTE),
  );
  return `Workspace archive exceeds the ${maxMegabytes} MB limit`;
}

export class WorkspaceArchiveTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(formatWorkspaceArchiveTooLargeError(maxBytes));
    this.name = "WorkspaceArchiveTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export const DEFAULT_WORKSPACE_ARCHIVE_MAX_BYTES = workspaceTransferLimitMbToBytes(
  DEFAULT_GENERAL_SETTINGS.workspaceTransferLimitMb,
);

type ExportManifest = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
};

type BuildWorkspaceArchiveOptions = {
  maxWorkspaceBytes?: number;
};

type RestoreWorkspaceArchiveOptions = {
  maxArchiveBytes?: number;
  validateContentRoot?: (contentRoot: string) => Promise<void> | void;
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

async function getDirectorySize(directoryPath: string): Promise<number> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  let size = 0;

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      size += await getDirectorySize(entryPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    size += (await fs.stat(entryPath)).size;
  }

  return size;
}

function normalizeZipRelativePath(fileName: string) {
  const normalizedFileName = fileName.replaceAll("\\", "/");
  if (!normalizedFileName.startsWith(EXPORT_CONTENT_PREFIX)) {
    return null;
  }

  const relativePath = normalizedFileName.slice(EXPORT_CONTENT_PREFIX.length);
  if (!relativePath) {
    return null;
  }

  const normalizedRelativePath = path.posix.normalize(relativePath);
  if (
    !normalizedRelativePath ||
    normalizedRelativePath === "." ||
    normalizedRelativePath.startsWith("../") ||
    normalizedRelativePath === ".." ||
    path.posix.isAbsolute(normalizedRelativePath)
  ) {
    throw new Error("Archive contains an unsafe path");
  }

  return normalizedRelativePath;
}

function resolveArchiveDestination(rootPath: string, relativePath: string) {
  const resolvedRoot = path.resolve(rootPath);
  const destinationPath = path.resolve(
    resolvedRoot,
    ...relativePath.split("/"),
  );

  if (
    destinationPath !== resolvedRoot &&
    !destinationPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Archive contains an unsafe path");
  }

  return destinationPath;
}

function canFallbackToInPlaceReplace(error: unknown) {
  const fileError = error as NodeJS.ErrnoException;
  return (
    fileError?.code === "EBUSY" ||
    fileError?.code === "EXDEV" ||
    fileError?.code === "EPERM"
  );
}

async function moveDirectoryContents(
  sourceDirectory: string,
  destinationDirectory: string,
  options?: {
    skipNames?: Set<string>;
  },
) {
  const skipNames = options?.skipNames ?? new Set<string>();
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
  const movedEntries: string[] = [];

  try {
    for (const entry of entries) {
      if (skipNames.has(entry.name)) {
        continue;
      }

      const sourcePath = path.join(sourceDirectory, entry.name);
      const destinationPath = path.join(destinationDirectory, entry.name);
      await fs.rename(sourcePath, destinationPath);
      movedEntries.push(entry.name);
    }
  } catch (error) {
    for (const entryName of movedEntries.reverse()) {
      await fs
        .rename(
          path.join(destinationDirectory, entryName),
          path.join(sourceDirectory, entryName),
        )
        .catch(() => undefined);
    }
    throw error;
  }
}

async function copyDirectoryContents(
  sourceDirectory: string,
  destinationDirectory: string,
) {
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    await fs.cp(
      path.join(sourceDirectory, entry.name),
      path.join(destinationDirectory, entry.name),
      {
        recursive: true,
        errorOnExist: true,
        force: false,
      },
    );
  }
}

async function removeDirectoryContents(
  directoryPath: string,
  options?: {
    skipNames?: Set<string>;
  },
) {
  const skipNames = options?.skipNames ?? new Set<string>();
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => !skipNames.has(entry.name))
      .map((entry) =>
        fs.rm(path.join(directoryPath, entry.name), {
          recursive: true,
          force: true,
        }),
      ),
  );
}

async function replaceDirectoryInPlace(
  destinationPath: string,
  stagingPath: string,
  backupPath: string,
) {
  await fs.mkdir(destinationPath, { recursive: true });

  const inPlaceBackupName = path.basename(backupPath);
  const inPlaceBackupPath = path.join(destinationPath, inPlaceBackupName);

  await fs.rm(inPlaceBackupPath, { recursive: true, force: true });
  await fs.mkdir(inPlaceBackupPath, { recursive: true });

  try {
    await moveDirectoryContents(destinationPath, inPlaceBackupPath, {
      skipNames: new Set([inPlaceBackupName]),
    });
    try {
      await copyDirectoryContents(stagingPath, destinationPath);
    } catch (error) {
      await removeDirectoryContents(destinationPath, {
        skipNames: new Set([inPlaceBackupName]),
      }).catch(() => undefined);
      await moveDirectoryContents(inPlaceBackupPath, destinationPath).catch(
        () => undefined,
      );
      throw error;
    }

    await fs.rm(stagingPath, { recursive: true, force: true });
    await fs.rm(inPlaceBackupPath, { recursive: true, force: true });
  } catch (error) {
    await fs.rm(stagingPath, { recursive: true, force: true }).catch(
      () => undefined,
    );
    await fs.rm(inPlaceBackupPath, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  }
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
    try {
      await fs.rename(destinationPath, backupPath);
    } catch (error) {
      if (canFallbackToInPlaceReplace(error)) {
        await replaceDirectoryInPlace(destinationPath, stagingPath, backupPath);
        return;
      }
      throw error;
    }
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

export async function buildWorkspaceArchive(
  contentRoot: string,
  options: BuildWorkspaceArchiveOptions = {},
) {
  const maxWorkspaceBytes =
    options.maxWorkspaceBytes ?? DEFAULT_WORKSPACE_ARCHIVE_MAX_BYTES;
  const workspaceSize = await getDirectorySize(contentRoot);
  if (workspaceSize > maxWorkspaceBytes) {
    throw new WorkspaceArchiveTooLargeError(maxWorkspaceBytes);
  }

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
  options: RestoreWorkspaceArchiveOptions = {},
) {
  const maxArchiveBytes =
    options.maxArchiveBytes ?? DEFAULT_WORKSPACE_ARCHIVE_MAX_BYTES;
  if (archiveBuffer.byteLength > maxArchiveBytes) {
    throw new WorkspaceArchiveTooLargeError(maxArchiveBytes);
  }

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
  let replaceStarted = false;

  try {
    for (const file of files) {
      const relativePath = normalizeZipRelativePath(file.name);
      if (!relativePath) {
        continue;
      }

      wroteFile = true;
      const destinationFile = resolveArchiveDestination(stagingPath, relativePath);
      const destinationDirectory = path.dirname(destinationFile);
      await fs.mkdir(destinationDirectory, { recursive: true });
      await fs.writeFile(destinationFile, await file.async("nodebuffer"));
    }

    if (!wroteFile) {
      throw new Error("Archive does not contain any workspace files");
    }

    await options.validateContentRoot?.(stagingPath);
    replaceStarted = true;
    await replaceDirectoryAtomically(contentRoot, stagingPath, backupPath);
  } catch (error) {
    if (!replaceStarted) {
      await fs.rm(stagingPath, { recursive: true, force: true });
      await fs.rm(backupPath, { recursive: true, force: true });
    }
    throw error;
  }
}
