import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import MiniSearch from "minisearch";
import {
  bookMetaSchema,
  chapterMetaSchema,
  type BookMeta,
  type BookRecord,
  type ChapterMeta,
  type ChapterRecord,
  type ContentRecord,
  type ContentTree,
  type GeneralSettings,
  type ManifestEntry,
  type MediaAsset,
  type MediaReference,
  type NoteMeta,
  type NoteRecord,
  type RouteAlias,
  type ContentSearchResult,
  noteMetaSchema,
  moveChapterSchema,
  moveNoteToBookSchema,
  reorderBooksSchema,
  reorderChaptersSchema,
  reorderNotesSchema,
  restoreRevisionSchema,
  createChapterSchema,
  saveBookSchema,
  saveGeneralSettingsSchema,
  saveNoteSchema,
  updateChapterContentSchema,
  type SearchDocument,
} from "@/lib/content/schemas";
import {
  defaultBookTypography,
  defaultNoteTypography,
  normalizeBookTypography,
} from "@/lib/book-typography";
import { env } from "@/lib/env";
import { DEFAULT_GENERAL_SETTINGS } from "@/lib/general-settings-config";
import { normalizeGeneralSettings } from "@/lib/general-settings";
import {
  mediaRelativePathToUrl,
  mediaUrlToRelativePath,
} from "@/lib/media-paths";
import { extractToc, headingId, splitWikiTarget } from "@/lib/markdown/shared";
import { isSafeSlug, safeJsonParse, stripMarkdown, toSlug } from "@/lib/utils";
import {
  ensureUserStoreFile,
  validateUserStoreFile,
} from "@/lib/user-store";
import {
  buildWorkspaceArchive,
  restoreWorkspaceArchive,
  workspaceTransferLimitMbToBytes,
} from "@/lib/workspace-transfer";

const contentRoot = path.join(process.cwd(), env.contentRoot);
const booksRoot = path.join(contentRoot, "books");
const notesRoot = path.join(contentRoot, "notes");
const systemRoot = path.join(contentRoot, ".webbook");
const uploadsRoot = path.join(systemRoot, "uploads");
const trashUploadsRoot = path.join(systemRoot, "trash", "uploads");
const revisionsRoot = path.join(systemRoot, "revisions");
const indexesRoot = path.join(systemRoot, "indexes");
const settingsFilePath = path.join(systemRoot, "settings.json");
const CHAPTER_MOVE_ENDPOINT_HINT =
  "Use /api/books/{bookSlug}/chapters/move for order/parent changes";

type IndexState = {
  manifest: ManifestEntry[];
  backlinks: Record<string, ManifestEntry[]>;
  search: string;
};

type PublicContentTree = ContentTree;
type OrderedChapterFile = {
  fileName: string;
  filePath: string;
  order: number;
  slug: string;
};
type ChapterPathResolution =
  | { ok: true; chapterPath: string[] }
  | { ok: false; reason: "not-found" | "ambiguous" };
type OrderedBookFile = {
  filePath: string;
  order?: number;
  slug: string;
};
type OrderedNoteFile = {
  filePath: string;
  order?: number;
  slug: string;
};

function bookDirectory(bookSlug: string) {
  return path.join(booksRoot, bookSlug);
}

function chapterFilePath(bookSlug: string, chapterSlug: string, order: number) {
  return path.join(
    bookDirectory(bookSlug),
    "chapters",
    `${String(order).padStart(3, "0")}-${chapterSlug}.md`,
  );
}

function chapterStem(order: number, slug: string) {
  return `${String(order).padStart(3, "0")}-${slug}`;
}

function chapterNodeDirectory(chaptersPath: string, order: number, slug: string) {
  return path.join(chaptersPath, chapterStem(order, slug));
}

function chapterChildrenDirectory(chaptersPath: string, order: number, slug: string) {
  return path.join(chapterNodeDirectory(chaptersPath, order, slug), "chapters");
}

function chapterChildrenDirectoryByFile(chapterFilePathValue: string) {
  return path.join(
    path.dirname(chapterFilePathValue),
    path.basename(chapterFilePathValue, ".md"),
    "chapters",
  );
}

function chapterRoute(bookSlug: string, chapterPath: string[]) {
  return `/books/${bookSlug}/${chapterPath.join("/")}`;
}

function chapterWorkspaceRoute(bookSlug: string, chapterPath: string[]) {
  return `/app/books/${bookSlug}/chapters/${chapterPath.join("/")}`;
}

function parseOrderedMarkdownFileName(fileName: string) {
  const match = /^(\d+)-(.+)\.md$/i.exec(fileName);
  if (!match) {
    return null;
  }

  return {
    order: Number.parseInt(match[1], 10),
    slug: match[2],
  };
}

function noteFilePath(slug: string) {
  return path.join(notesRoot, `${slug}.md`);
}

function contentOrder(order?: number) {
  return order ?? Number.MAX_SAFE_INTEGER;
}

function filterPublishedManifestEntries(entries: ManifestEntry[]) {
  return entries.filter((entry) => entry.status === "published");
}

function bookFilePath(bookSlug: string) {
  return path.join(bookDirectory(bookSlug), "book.md");
}

function indexFile(name: string) {
  return path.join(indexesRoot, name);
}

function ensureSafeSlugOrThrow(slug: string) {
  if (!isSafeSlug(slug)) {
    throw new Error(`Invalid slug: ${slug}`);
  }
}

function buildSearch(documents: SearchDocument[]) {
  const miniSearch = new MiniSearch<SearchDocument>({
    fields: ["title", "summary", "body"],
    storeFields: [
      "id",
      "title",
      "kind",
      "slug",
      "bookSlug",
      "status",
      "summary",
      "publicRoute",
      "workspaceRoute",
    ],
  });
  miniSearch.addAll(documents);
  return miniSearch.toJSON();
}

function mapSearchResults(
  results: Array<
    Partial<
      Pick<
        SearchDocument,
        | "title"
        | "kind"
        | "slug"
        | "bookSlug"
        | "status"
        | "summary"
        | "publicRoute"
        | "workspaceRoute"
      >
    > & { id: string | number }
  >,
  routeScope: "public" | "workspace",
): ContentSearchResult[] {
  return results.map((result) => ({
    id: String(result.id),
    title: result.title ?? "Untitled",
    kind: result.kind ?? "note",
    slug: result.slug ?? "",
    bookSlug: result.bookSlug,
    status: result.status ?? "draft",
    summary: result.summary ?? "",
    route:
      routeScope === "workspace"
        ? result.workspaceRoute ?? result.publicRoute ?? "#"
        : result.publicRoute ?? result.workspaceRoute ?? "#",
    publicRoute: result.publicRoute ?? "#",
    workspaceRoute: result.workspaceRoute ?? "#",
  }));
}

async function readDirectoryEntries(directoryPath: string) {
  try {
    return await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function ensureDirectory(directoryPath: string) {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function validateImportedGeneralSettings(contentPath: string) {
  const importedSettingsPath = path.join(contentPath, ".webbook", "settings.json");

  try {
    const raw = await fs.readFile(importedSettingsPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    saveGeneralSettingsSchema.parse(
      normalizeGeneralSettings({
        ...DEFAULT_GENERAL_SETTINGS,
        ...parsed,
      }),
    );
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") {
      return;
    }
    throw new Error("Imported workspace settings are invalid");
  }
}

async function validateImportedWorkspace(contentPath: string) {
  const importedBooksRoot = path.join(contentPath, "books");
  const importedNotesRoot = path.join(contentPath, "notes");
  const bookEntries = await readDirectoryEntries(importedBooksRoot);
  const noteEntries = await readDirectoryEntries(importedNotesRoot);

  for (const entry of bookEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const filePath = path.join(importedBooksRoot, entry.name, "book.md");
    try {
      await parseBookFile(filePath);
    } catch {
      throw new Error(`Imported workspace contains an invalid book: books/${entry.name}/book.md`);
    }
  }

  for (const entry of noteEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const filePath = path.join(importedNotesRoot, entry.name);
    try {
      await parseNoteFile(filePath);
    } catch {
      throw new Error(`Imported workspace contains an invalid note: notes/${entry.name}`);
    }
  }

  await validateImportedGeneralSettings(contentPath);
  await validateUserStoreFile(path.join(contentPath, ".webbook", "users.json"));
}

async function writeFileAtomic(filePath: string, content: string) {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

function featuredTimestamp(book: BookRecord) {
  return new Date(book.meta.featuredAt ?? book.meta.updatedAt).getTime();
}

async function enforceFeaturedBookLimit() {
  const books = await listBookRecords();
  const now = new Date().toISOString();
  const featuredBooks = books
    .filter((book) => book.meta.featured === true)
    .sort((left, right) => featuredTimestamp(right) - featuredTimestamp(left));

  await Promise.all(
    featuredBooks
      .slice(3)
      .map((book) =>
        fs.writeFile(
          book.filePath,
          renderMatter(
            {
              ...book.meta,
              featured: false,
              featuredAt: undefined,
              updatedAt: now,
            } satisfies BookMeta,
            book.body,
          ),
          "utf8",
        ),
      ),
  );
}

async function ensureSettingsFile() {
  try {
    await fs.access(settingsFilePath);
  } catch {
    await writeFileAtomic(
      settingsFilePath,
      JSON.stringify(DEFAULT_GENERAL_SETTINGS, null, 2),
    );
  }
}

function legacyNoteId(slug: string) {
  return `note:${slug}`;
}

function legacyBookId(slug: string) {
  return `book:${slug}`;
}

function legacyChapterIdFromPath(bookSlug: string, chapterPath: string[]) {
  return `chapter:${bookSlug}/${chapterPath.join("/")}`;
}

function chapterPathFromLocation(location: string) {
  const [bookSlug, ...chapterPath] = location.split("/").filter(Boolean);
  return {
    bookSlug: bookSlug ?? "",
    chapterPath,
  };
}

function chapterLocation(bookSlug: string, chapterPath: string[]) {
  return `${bookSlug}/${chapterPath.join("/")}`;
}

function noteWorkspaceRoute(slug: string) {
  return `/app/notes/${slug}`;
}

function bookWorkspaceRoute(slug: string) {
  return `/app/books/${slug}`;
}

function normalizeRouteAliases(input: RouteAlias[] | undefined) {
  const deduped = new Map<string, RouteAlias>();
  for (const alias of input ?? []) {
    const key = `${alias.kind}:${alias.location}`;
    if (!deduped.has(key)) {
      deduped.set(key, alias);
    }
  }
  return Array.from(deduped.values());
}

function withRouteAlias<T extends { routeAliases: RouteAlias[] }>(
  meta: T,
  alias: RouteAlias,
) {
  const exists = meta.routeAliases.some(
    (entry) => entry.kind === alias.kind && entry.location === alias.location,
  );
  if (exists) {
    return meta;
  }
  return {
    ...meta,
    routeAliases: [...meta.routeAliases, alias],
  };
}

function routeAliasesEqual(left: RouteAlias[] | undefined, right: RouteAlias[]) {
  if (!left) {
    return right.length === 0;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every(
    (alias, index) =>
      alias.kind === right[index]?.kind && alias.location === right[index]?.location,
  );
}

function recordId(kind: "book" | "note" | "chapter", existingId: string | undefined, fallback: string) {
  if (existingId) {
    return existingId;
  }

  if (kind === "book") {
    return legacyBookId(fallback);
  }
  if (kind === "note") {
    return legacyNoteId(fallback);
  }
  return `chapter:${fallback}`;
}

function nextContentId() {
  return randomUUID();
}

type BackfilledMeta<T extends { id?: string; routeAliases?: RouteAlias[] }> = Omit<
  T,
  "id" | "routeAliases"
> & {
  id: string;
  routeAliases: RouteAlias[];
};

async function ensureBackfilledMeta<T extends { id?: string; routeAliases?: RouteAlias[] }>(
  filePath: string,
  meta: T,
  body: string,
): Promise<{ meta: BackfilledMeta<T>; raw: string | null }> {
  const nextMeta = {
    ...meta,
    id: meta.id ?? nextContentId(),
    routeAliases: normalizeRouteAliases(meta.routeAliases),
  } as BackfilledMeta<T>;

  if (
    meta.id &&
    meta.routeAliases !== undefined &&
    routeAliasesEqual(meta.routeAliases, nextMeta.routeAliases)
  ) {
    return {
      meta: nextMeta,
      raw: null,
    };
  }

  const raw = renderMatter(nextMeta, body);
  await writeFileAtomic(filePath, raw);
  return {
    meta: nextMeta,
    raw,
  };
}

function normalizeChapterPathInput(input: string | string[]) {
  const chapterPath = Array.isArray(input)
    ? input.filter(Boolean)
    : input.split("/").filter(Boolean);

  for (const segment of chapterPath) {
    ensureSafeSlugOrThrow(segment);
  }

  return chapterPath;
}

function nextCopyTitle(title: string) {
  return title.endsWith(" Copy") ? `${title} 2` : `${title} Copy`;
}

function nextCopySlug(baseSlug: string, existingSlugs: Set<string>) {
  const normalizedBase = toSlug(baseSlug);
  const firstCandidate = `${normalizedBase}-copy`;
  if (!existingSlugs.has(firstCandidate)) {
    return firstCandidate;
  }

  let counter = 2;
  while (existingSlugs.has(`${normalizedBase}-copy-${counter}`)) {
    counter += 1;
  }

  return `${normalizedBase}-copy-${counter}`;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, stripUndefinedDeep(item)]),
    ) as T;
  }

  return value;
}

function renderMatter(data: object, body: string) {
  return matter.stringify(body, stripUndefinedDeep(data), {
    language: "yaml",
  });
}

function toDisplayPath(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function wrapContentFileError(filePath: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown content file error";
  return new Error(`Invalid content file ${toDisplayPath(filePath)}: ${message}`);
}

function extractFrontMatter(raw: string) {
  return /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(raw);
}

function readFrontMatterScalar(raw: string, key: string) {
  const frontMatterMatch = extractFrontMatter(raw);
  if (!frontMatterMatch) {
    return null;
  }

  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = pattern.exec(frontMatterMatch[1]);
  if (!match) {
    return null;
  }

  const value = match[1].trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function contentIdFromRaw(
  kind: "book" | "note" | "chapter",
  raw: string,
  fallback: string,
) {
  const storedId = readFrontMatterScalar(raw, "id");
  return recordId(kind, storedId ?? undefined, fallback);
}

function readFrontMatterOrder(raw: string) {
  const value = readFrontMatterScalar(raw, "order");
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rewriteFrontMatterScalar(raw: string, key: string, value: string | number) {
  const rewriteWithRegex = () => {
    const frontMatterMatch = extractFrontMatter(raw);
    if (!frontMatterMatch) {
      throw new Error("Missing front matter block");
    }

    const frontMatter = frontMatterMatch[1];
    const pattern = new RegExp(`(^${key}:\\s*).*$`, "m");
    if (!pattern.test(frontMatter)) {
      throw new Error(`Missing front matter field: ${key}`);
    }

    const serializedValue =
      typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;
    const nextFrontMatter = frontMatter.replace(pattern, `$1${serializedValue}`);

    return `${raw.slice(0, frontMatterMatch.index)}---\n${nextFrontMatter}\n---${frontMatterMatch[2]}${raw.slice(frontMatterMatch.index + frontMatterMatch[0].length)}`;
  };

  try {
    const parsed = matter(raw);
    if (
      parsed.data &&
      typeof parsed.data === "object" &&
      Object.prototype.hasOwnProperty.call(parsed.data, key)
    ) {
      return renderMatter(
        {
          ...(parsed.data as Record<string, unknown>),
          [key]: value,
        },
        parsed.content,
      );
    }
  } catch {
    return rewriteWithRegex();
  }

  return rewriteWithRegex();
}

async function listOrderedChapterFilesAtPath(chaptersPath: string) {
  return (await readDirectoryEntries(chaptersPath))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const parsed = parseOrderedMarkdownFileName(entry.name);
      return parsed
        ? {
            fileName: entry.name,
            filePath: path.join(chaptersPath, entry.name),
            order: parsed.order,
            slug: parsed.slug,
          }
        : null;
    })
    .filter(
      (
        entry,
      ): entry is OrderedChapterFile => entry !== null,
    )
    .sort((left, right) => left.order - right.order || left.slug.localeCompare(right.slug));
}

type ChapterEntryLocation = {
  chapterPath: string[];
  chaptersPath: string;
  entry: OrderedChapterFile;
};

type ChapterFileNode = {
  slug: string;
  order: number;
  path: string[];
  filePath: string;
  raw: string;
  children: ChapterFileNode[];
};

async function listChapterEntryLocations(
  bookSlug: string,
  chaptersPath = path.join(bookDirectory(bookSlug), "chapters"),
  parentPath: string[] = [],
): Promise<ChapterEntryLocation[]> {
  const entries = await listOrderedChapterFilesAtPath(chaptersPath);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const chapterPath = [...parentPath, entry.slug];
      const childrenPath = chapterChildrenDirectory(chaptersPath, entry.order, entry.slug);
      return [
        { chapterPath, chaptersPath, entry } satisfies ChapterEntryLocation,
        ...(await listChapterEntryLocations(bookSlug, childrenPath, chapterPath)),
      ];
    }),
  );
  return nested.flat();
}

async function resolveChapterEntryLocation(
  bookSlug: string,
  chapterPathInput: string | string[],
): Promise<
  | { ok: true; canonicalBookSlug: string; location: ChapterEntryLocation }
  | { ok: false; reason: "not-found" | "ambiguous" }
> {
  const requestedPath = normalizeChapterPathInput(chapterPathInput);
  if (!requestedPath.length) {
    return { ok: false, reason: "not-found" };
  }

  const resolvedChapter = await resolveChapterRecord(bookSlug, requestedPath);
  if (resolvedChapter) {
    const canonicalBookSlug = resolvedChapter.chapter.meta.bookSlug;
    const locations = await listChapterEntryLocations(canonicalBookSlug);
    const exact = locations.find((location) =>
      chapterPathsEqual(location.chapterPath, resolvedChapter.chapter.path),
    );
    if (exact) {
      return { ok: true, canonicalBookSlug, location: exact };
    }
  }

  const canonicalBookSlug = (await resolveBookRecord(bookSlug))?.record.meta.slug ?? bookSlug;
  const locations = await listChapterEntryLocations(canonicalBookSlug);
  const exact = locations.find((location) => chapterPathsEqual(location.chapterPath, requestedPath));
  if (exact) {
    return { ok: true, canonicalBookSlug, location: exact };
  }

  if (requestedPath.length === 1) {
    const leafMatches = locations.filter(
      (location) => location.chapterPath[location.chapterPath.length - 1] === requestedPath[0],
    );
    if (leafMatches.length === 1) {
      return { ok: true, canonicalBookSlug, location: leafMatches[0] };
    }
    if (leafMatches.length > 1) {
      return { ok: false, reason: "ambiguous" };
    }
  }

  return { ok: false, reason: "not-found" };
}

async function resolveParentChaptersPath(bookSlug: string, parentPath: string[]) {
  const canonicalBookSlug = (await resolveBookRecord(bookSlug))?.record.meta.slug;
  if (!canonicalBookSlug) {
    throw new Error("Book not found");
  }

  if (!parentPath.length) {
    return {
      canonicalBookSlug,
      parentChapterPath: [] as string[],
      chaptersPath: path.join(bookDirectory(canonicalBookSlug), "chapters"),
    };
  }

  const parentResolution = await resolveChapterEntryLocation(canonicalBookSlug, parentPath);
  if (!parentResolution.ok) {
    if (parentResolution.reason === "ambiguous") {
      throw new Error("Parent chapter path is ambiguous");
    }
    throw new Error("Parent chapter not found");
  }

  const { chaptersPath, entry } = parentResolution.location;
  return {
    canonicalBookSlug: parentResolution.canonicalBookSlug,
    parentChapterPath: parentResolution.location.chapterPath,
    chaptersPath: chapterChildrenDirectory(chaptersPath, entry.order, entry.slug),
  };
}

async function copyChapterSubtree(
  sourceChaptersPath: string,
  sourceEntry: OrderedChapterFile,
  destinationChaptersPath: string,
  destinationOrder: number,
  destinationSlug: string,
) {
  const sourceNodePath = chapterNodeDirectory(
    sourceChaptersPath,
    sourceEntry.order,
    sourceEntry.slug,
  );
  const destinationNodePath = chapterNodeDirectory(
    destinationChaptersPath,
    destinationOrder,
    destinationSlug,
  );

  try {
    await fs.access(sourceNodePath);
  } catch {
    return;
  }

  await fs.cp(sourceNodePath, destinationNodePath, { recursive: true });
}

async function rewriteBookChapterMetadataForRename(
  chaptersPath: string,
  previousBookSlug: string,
  nextBookSlug: string,
  now: string,
  parentPath: string[] = [],
) {
  const entries = await listOrderedChapterFilesAtPath(chaptersPath);
  for (const entry of entries) {
    const chapterPath = [...parentPath, entry.slug];
    const raw = await fs.readFile(entry.filePath, "utf8");
    const parsed = matter(raw);
    const parsedMeta = chapterMetaSchema.parse({
      ...parsed.data,
      bookSlug: previousBookSlug,
      slug: entry.slug,
      order: entry.order,
    });
    const nextMeta: ChapterMeta = {
      ...parsedMeta,
      id: recordId("chapter", parsedMeta.id, chapterLocation(previousBookSlug, chapterPath)),
      routeAliases: normalizeRouteAliases(parsedMeta.routeAliases),
      bookSlug: nextBookSlug,
      updatedAt: now,
    };
    await writeFileAtomic(entry.filePath, renderMatter(nextMeta, parsed.content.trim()));
    await rewriteBookChapterMetadataForRename(
      chapterChildrenDirectory(chaptersPath, entry.order, entry.slug),
      previousBookSlug,
      nextBookSlug,
      now,
      chapterPath,
    );
  }
}

async function listOrderedBookFiles() {
  const entries = await readDirectoryEntries(booksRoot);
  const books = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const filePath = bookFilePath(entry.name);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          return {
            filePath,
            order: readFrontMatterOrder(raw),
            slug: entry.name,
          } satisfies OrderedBookFile;
        } catch {
          return {
            filePath,
            order: undefined,
            slug: entry.name,
          } satisfies OrderedBookFile;
        }
      }),
  );

  return books.sort(
    (left, right) =>
      contentOrder(left.order) - contentOrder(right.order) || left.slug.localeCompare(right.slug),
  );
}

async function listOrderedNoteFiles() {
  const entries = await readDirectoryEntries(notesRoot);
  const notes = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry) => {
        const slug = entry.name.replace(/\.md$/i, "");
        const filePath = noteFilePath(slug);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          return {
            filePath,
            order: readFrontMatterOrder(raw),
            slug,
          } satisfies OrderedNoteFile;
        } catch {
          return {
            filePath,
            order: undefined,
            slug,
          } satisfies OrderedNoteFile;
        }
      }),
  );

  return notes.sort(
    (left, right) =>
      contentOrder(left.order) - contentOrder(right.order) || left.slug.localeCompare(right.slug),
  );
}

function extractWikiTargets(markdown: string) {
  return Array.from(markdown.matchAll(/\[\[([^[\]]+)\]\]/g)).map((match) =>
    match[1].trim(),
  );
}

function buildManifestAliasLookup(manifest: ManifestEntry[]) {
  const aliasLookup = new Map<string, ManifestEntry | null>();
  const chapterEntries = manifest.filter((entry) => entry.kind === "chapter");

  const addAlias = (alias: string, entry: ManifestEntry) => {
    const existing = aliasLookup.get(alias);
    if (!existing) {
      aliasLookup.set(alias, entry);
      return;
    }

    if (existing.id !== entry.id) {
      aliasLookup.set(alias, null);
    }
  };

  for (const entry of manifest) {
    if (entry.kind !== "chapter") {
      addAlias(entry.slug, entry);
      for (const alias of entry.routeAliases ?? []) {
        if (alias.kind === "book" || alias.kind === "note") {
          addAlias(alias.location, entry);
        }
      }
    }
  }

  const leafAliasCount = new Map<string, number>();
  const bookLeafAliasCount = new Map<string, number>();

  for (const entry of chapterEntries) {
    const leafAlias = entry.slug;
    const bookLeafAlias = `${entry.bookSlug}/${entry.slug}`;
    leafAliasCount.set(leafAlias, (leafAliasCount.get(leafAlias) ?? 0) + 1);
    bookLeafAliasCount.set(bookLeafAlias, (bookLeafAliasCount.get(bookLeafAlias) ?? 0) + 1);
  }

  for (const entry of chapterEntries) {
    const canonicalAlias = `${entry.bookSlug}/${entry.chapterPath?.join("/") ?? entry.slug}`;
    addAlias(canonicalAlias, entry);
    for (const alias of entry.routeAliases ?? []) {
      addAlias(alias.location, entry);
    }

    const bookLeafAlias = `${entry.bookSlug}/${entry.slug}`;
    if ((bookLeafAliasCount.get(bookLeafAlias) ?? 0) === 1) {
      addAlias(bookLeafAlias, entry);
    }

    if ((leafAliasCount.get(entry.slug) ?? 0) === 1) {
      addAlias(entry.slug, entry);
    }
  }

  return aliasLookup;
}

async function parseBookFile(filePath: string): Promise<BookRecord> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const parsedMeta = bookMetaSchema.parse(parsed.data);
    const { meta: backfilledMeta, raw: backfilledRaw } = await ensureBackfilledMeta(
      filePath,
      parsedMeta,
      parsed.content,
    );
    const meta: BookMeta = {
      ...backfilledMeta,
      typography: backfilledMeta.typography
        ? normalizeBookTypography(backfilledMeta.typography, defaultBookTypography)
        : undefined,
    };
    const chaptersDir = path.join(path.dirname(filePath), "chapters");
    const chapters = await parseChapterDirectory(chaptersDir, meta.slug, []);

    return {
      id: meta.id,
      kind: "book" as const,
      filePath,
      meta,
      body: parsed.content.trim(),
      raw: backfilledRaw ?? raw,
      route: `/books/${meta.slug}`,
      chapters,
    };
  } catch (error) {
    throw wrapContentFileError(filePath, error);
  }
}

async function parseChapterDirectory(
  chaptersPath: string,
  bookSlug: string,
  parentPath: string[],
): Promise<ChapterRecord[]> {
  const entries = await listOrderedChapterFilesAtPath(chaptersPath);
  const chapters: ChapterRecord[] = await Promise.all(
    entries.map((entry) =>
      parseChapterFile(entry.filePath, bookSlug, [...parentPath, entry.slug]),
    ),
  );
  return chapters.sort(
    (left: ChapterRecord, right: ChapterRecord) => left.meta.order - right.meta.order,
  );
}

async function parseChapterFile(
  filePath: string,
  bookSlug: string,
  chapterPath: string[],
): Promise<ChapterRecord> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const slugFromPath = chapterPath.at(-1);
    if (!slugFromPath) {
      throw new Error("Missing chapter slug");
    }
    const meta = chapterMetaSchema.parse({
      ...parsed.data,
      bookSlug,
      slug: slugFromPath,
    });
    const { meta: backfilledMeta, raw: backfilledRaw } = await ensureBackfilledMeta(
      filePath,
      meta,
      parsed.content,
    );
    const normalizedMeta: ChapterMeta = {
      ...backfilledMeta,
    };
    const children = await parseChapterDirectory(
      chapterChildrenDirectoryByFile(filePath),
      bookSlug,
      chapterPath,
    );

    return {
      id: normalizedMeta.id,
      kind: "chapter" as const,
      filePath,
      meta: normalizedMeta,
      path: chapterPath,
      body: parsed.content.trim(),
      raw: backfilledRaw ?? raw,
      route: chapterRoute(normalizedMeta.bookSlug, chapterPath),
      children,
    };
  } catch (error) {
    throw wrapContentFileError(filePath, error);
  }
}

async function parseNoteFile(filePath: string): Promise<NoteRecord> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const parsedMeta = noteMetaSchema.parse(parsed.data);
    const { meta: backfilledMeta, raw: backfilledRaw } = await ensureBackfilledMeta(
      filePath,
      parsedMeta,
      parsed.content,
    );
    const meta: NoteMeta = {
      ...backfilledMeta,
      typography: backfilledMeta.typography
        ? normalizeBookTypography(backfilledMeta.typography, defaultNoteTypography)
        : undefined,
    };
    return {
      id: meta.id,
      kind: "note" as const,
      filePath,
      meta,
      body: parsed.content.trim(),
      raw: backfilledRaw ?? raw,
      route: `/notes/${meta.slug}`,
    };
  } catch (error) {
    throw wrapContentFileError(filePath, error);
  }
}

async function listBookRecords(): Promise<BookRecord[]> {
  const bookEntries = await readDirectoryEntries(booksRoot);
  const books = (
    await Promise.all(
      bookEntries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return await parseBookFile(bookFilePath(entry.name));
          } catch {
            return null;
          }
        }),
    )
  ).filter((book): book is BookRecord => book !== null);
  return books.sort(
    (left, right) =>
      contentOrder(left.meta.order) - contentOrder(right.meta.order) ||
      left.meta.title.localeCompare(right.meta.title),
  );
}

async function listNoteRecords(): Promise<NoteRecord[]> {
  const noteEntries = await readDirectoryEntries(notesRoot);
  const notes = (
    await Promise.all(
      noteEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map(async (entry) => {
          try {
            return await parseNoteFile(path.join(notesRoot, entry.name));
          } catch {
            return null;
          }
        }),
    )
  ).filter((note): note is NoteRecord => note !== null);
  return notes.sort(
    (left, right) =>
      contentOrder(left.meta.order) - contentOrder(right.meta.order) ||
      left.meta.title.localeCompare(right.meta.title),
  );
}

function flattenChapters(chapters: BookRecord["chapters"]): BookRecord["chapters"] {
  return chapters.flatMap((chapter) => [chapter, ...flattenChapters(chapter.children)]);
}

function findChapterByPath(
  chapters: BookRecord["chapters"],
  chapterPath: string[],
): BookRecord["chapters"][number] | null {
  if (!chapterPath.length) {
    return null;
  }

  const [segment, ...rest] = chapterPath;
  const chapter = chapters.find((entry) => entry.meta.slug === segment) ?? null;
  if (!chapter) {
    return null;
  }

  if (!rest.length) {
    return chapter;
  }

  return findChapterByPath(chapter.children, rest);
}

function findChapterByLeafSlug(
  chapters: BookRecord["chapters"],
  leafSlug: string,
): ChapterPathResolution {
  const matches = flattenChapters(chapters).filter((chapter) => chapter.meta.slug === leafSlug);
  if (matches.length === 0) {
    return { ok: false, reason: "not-found" };
  }
  if (matches.length > 1) {
    return { ok: false, reason: "ambiguous" };
  }
  return { ok: true, chapterPath: matches[0].path };
}

function resolveChapterPath(
  chapters: BookRecord["chapters"],
  requestedPath: string[],
): ChapterPathResolution {
  const exact = findChapterByPath(chapters, requestedPath);
  if (exact) {
    return { ok: true, chapterPath: exact.path };
  }

  if (requestedPath.length === 1) {
    return findChapterByLeafSlug(chapters, requestedPath[0]);
  }

  return { ok: false, reason: "not-found" };
}

function chapterPathsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function chapterPathStartsWith(pathValue: string[], prefix: string[]) {
  return (
    prefix.length <= pathValue.length &&
    prefix.every((segment, index) => pathValue[index] === segment)
  );
}

async function loadChapterFileTree(
  chaptersPath: string,
  parentPath: string[] = [],
): Promise<ChapterFileNode[]> {
  const entries = await listOrderedChapterFilesAtPath(chaptersPath);
  return Promise.all(
    entries.map(async (entry) => {
      const chapterPath = [...parentPath, entry.slug];
      return {
        slug: entry.slug,
        order: entry.order,
        path: chapterPath,
        filePath: entry.filePath,
        raw: await fs.readFile(entry.filePath, "utf8"),
        children: await loadChapterFileTree(
          chapterChildrenDirectory(chaptersPath, entry.order, entry.slug),
          chapterPath,
        ),
      } satisfies ChapterFileNode;
    }),
  );
}

function findChapterFileSiblingsByParentPath(
  chapters: ChapterFileNode[],
  parentPath: string[],
): ChapterFileNode[] | null {
  if (parentPath.length === 0) {
    return chapters;
  }

  const [head, ...tail] = parentPath;
  const parent = chapters.find((chapter) => chapter.slug === head);
  if (!parent) {
    return null;
  }

  return findChapterFileSiblingsByParentPath(parent.children, tail);
}

function renumberChapterFileSiblings(chapters: ChapterFileNode[], now: string) {
  for (const [index, chapter] of chapters.entries()) {
    chapter.order = index + 1;
    chapter.raw = rewriteFrontMatterScalar(chapter.raw, "order", chapter.order);
    chapter.raw = rewriteFrontMatterScalar(chapter.raw, "updatedAt", now);
  }
}

async function writeChapterFileTreeToDirectory(
  chaptersPath: string,
  chapters: ChapterFileNode[],
) {
  for (const chapter of chapters) {
    const stem = chapterStem(chapter.order, chapter.slug);
    const filePath = path.join(chaptersPath, `${stem}.md`);
    await fs.writeFile(filePath, chapter.raw, "utf8");

    if (chapter.children.length > 0) {
      const childrenPath = path.join(chaptersPath, stem, "chapters");
      await ensureDirectory(childrenPath);
      await writeChapterFileTreeToDirectory(childrenPath, chapter.children);
    }
  }
}

async function replaceBookChaptersDirectoryFromFileTree(
  bookSlug: string,
  chapters: ChapterFileNode[],
) {
  const chaptersPath = path.join(bookDirectory(bookSlug), "chapters");
  const bookRoot = bookDirectory(bookSlug);
  const stagingPath = path.join(bookRoot, `.chapters-write-${Date.now()}`);
  const backupPath = path.join(bookRoot, `.chapters-backup-${Date.now()}`);

  await ensureDirectory(stagingPath);
  await writeChapterFileTreeToDirectory(stagingPath, chapters);
  await ensureDirectory(chaptersPath);
  await fs.rename(chaptersPath, backupPath);

  try {
    await fs.rename(stagingPath, chaptersPath);
  } catch (error) {
    await fs.rename(backupPath, chaptersPath).catch(() => undefined);
    await fs.rm(stagingPath, { recursive: true, force: true });
    throw error;
  }

  await fs.rm(backupPath, { recursive: true, force: true });
}

function rewriteMovedChapterTree(
  chapter: ChapterFileNode,
  sourceBookSlug: string,
  destinationBookSlug: string,
  now: string,
) {
  const visit = (node: ChapterFileNode, isRoot: boolean) => {
    const parsed = matter(node.raw);
    const parsedMeta = chapterMetaSchema.parse({
      ...parsed.data,
      bookSlug: sourceBookSlug,
      slug: node.slug,
      order: node.order,
    });
    const normalizedAliases = normalizeRouteAliases(parsedMeta.routeAliases);
    const nextMeta: ChapterMeta = {
      ...parsedMeta,
      id: recordId("chapter", parsedMeta.id, chapterLocation(sourceBookSlug, node.path)),
      routeAliases: isRoot
        ? withRouteAlias(
            { routeAliases: normalizedAliases },
            {
              kind: "chapter",
              location: chapterLocation(sourceBookSlug, node.path),
            },
          ).routeAliases
        : normalizedAliases,
      bookSlug: destinationBookSlug,
      updatedAt: now,
    };
    node.raw = renderMatter(nextMeta, parsed.content.trim());
    for (const child of node.children) {
      visit(child, false);
    }
  };

  visit(chapter, true);
}

function recordToMediaReference(record: ContentRecord): MediaReference {
  return {
    id: record.id,
    kind: record.kind,
    title: record.meta.title,
    route: record.route,
  };
}

async function listAllContentRecords() {
  const books = await listBookRecords();
  const notes = await listNoteRecords();
  return [
    ...books,
    ...books.flatMap((book) => flattenChapters(book.chapters)),
    ...notes,
  ] satisfies ContentRecord[];
}

function matchesRouteAlias(
  aliases: RouteAlias[],
  kind: RouteAlias["kind"],
  location: string,
) {
  return aliases.some((alias) => alias.kind === kind && alias.location === location);
}

async function resolveBookRecord(bookSlug: string) {
  ensureSafeSlugOrThrow(bookSlug);
  await ensureContentScaffold();
  const books = await listBookRecords();
  const canonical = books.find((book) => book.meta.slug === bookSlug) ?? null;
  if (canonical) {
    return { record: canonical, aliased: false as const };
  }

  const matches = books.filter((book) =>
    matchesRouteAlias(book.meta.routeAliases, "book", bookSlug),
  );
  if (matches.length !== 1) {
    return null;
  }

  return { record: matches[0], aliased: true as const };
}

async function resolveNoteRecord(slug: string) {
  ensureSafeSlugOrThrow(slug);
  await ensureContentScaffold();
  const notes = await listNoteRecords();
  const canonical = notes.find((note) => note.meta.slug === slug) ?? null;
  if (canonical) {
    return { record: canonical, aliased: false as const };
  }

  const matches = notes.filter((note) =>
    matchesRouteAlias(note.meta.routeAliases, "note", slug),
  );
  if (matches.length !== 1) {
    return null;
  }

  return { record: matches[0], aliased: true as const };
}

async function resolveChapterRecord(bookSlug: string, chapterPathInput: string | string[]) {
  ensureSafeSlugOrThrow(bookSlug);
  const requestedPath = normalizeChapterPathInput(chapterPathInput);
  if (!requestedPath.length) {
    return null;
  }

  await ensureContentScaffold();
  const books = await listBookRecords();
  const requestedLocation = chapterLocation(bookSlug, requestedPath);

  for (const book of books) {
    for (const chapter of flattenChapters(book.chapters)) {
      if (book.meta.slug === bookSlug && chapterPathsEqual(chapter.path, requestedPath)) {
        return { book, chapter, aliased: false as const };
      }
    }
  }

  for (const book of books) {
    if (!matchesRouteAlias(book.meta.routeAliases, "book", bookSlug)) {
      continue;
    }
    const chapter = findChapterByPath(book.chapters, requestedPath);
    if (chapter) {
      return { book, chapter, aliased: true as const };
    }
  }

  for (const book of books) {
    for (const chapter of flattenChapters(book.chapters)) {
      if (matchesRouteAlias(chapter.meta.routeAliases, "chapter", requestedLocation)) {
        return { book, chapter, aliased: true as const };
      }

      for (const alias of chapter.meta.routeAliases) {
        if (alias.kind !== "chapter") {
          continue;
        }
        const { bookSlug: aliasBookSlug, chapterPath: aliasChapterPath } =
          chapterPathFromLocation(alias.location);
        if (aliasBookSlug !== bookSlug) {
          continue;
        }
        if (!chapterPathStartsWith(requestedPath, aliasChapterPath)) {
          continue;
        }
        const suffix = requestedPath.slice(aliasChapterPath.length);
        const descendant = findChapterByPath(book.chapters, [...chapter.path, ...suffix]);
        if (descendant) {
          return { book, chapter: descendant, aliased: true as const };
        }
      }
    }
  }

  return null;
}

export async function resolveWorkspaceBookRoute(bookSlug: string) {
  const resolved = await resolveBookRecord(bookSlug);
  if (!resolved) {
    return null;
  }
  return {
    book: resolved.record,
    aliased: resolved.aliased,
    workspaceRoute: bookWorkspaceRoute(resolved.record.meta.slug),
    publicRoute: resolved.record.route,
  };
}

export async function resolvePublicBookRoute(bookSlug: string) {
  const resolved = await resolveBookRecord(bookSlug);
  if (!resolved || resolved.record.meta.status !== "published") {
    return null;
  }
  const filterPublished = (chapters: BookRecord["chapters"]): BookRecord["chapters"] =>
    chapters
      .filter((chapter) => chapter.meta.status === "published")
      .map((chapter) => ({
        ...chapter,
        children: filterPublished(chapter.children),
      }));

  const book = {
    ...resolved.record,
    chapters: filterPublished(resolved.record.chapters),
  };

  return {
    book,
    aliased: resolved.aliased,
    workspaceRoute: bookWorkspaceRoute(book.meta.slug),
    publicRoute: book.route,
  };
}

export async function resolveWorkspaceNoteRoute(slug: string) {
  const note = await resolveNoteRecord(slug);
  if (note) {
    return {
      content: note.record,
      aliased: note.aliased,
      workspaceRoute: noteWorkspaceRoute(note.record.meta.slug),
      publicRoute: note.record.route,
    };
  }

  const books = await listBookRecords();
  const chapterMatch = books
    .flatMap((book) => flattenChapters(book.chapters).map((chapter) => ({ book, chapter })))
    .find(({ chapter }) => matchesRouteAlias(chapter.meta.routeAliases, "note", slug));
  if (!chapterMatch) {
    return null;
  }

  return {
    content: chapterMatch.chapter,
    aliased: true as const,
    workspaceRoute: chapterWorkspaceRoute(
      chapterMatch.chapter.meta.bookSlug,
      chapterMatch.chapter.path,
    ),
    publicRoute: chapterMatch.chapter.route,
  };
}

export async function resolvePublicNoteRoute(slug: string) {
  const resolved = await resolveWorkspaceNoteRoute(slug);
  if (!resolved) {
    return null;
  }

  if (resolved.content.kind === "note") {
    if (resolved.content.meta.status !== "published") {
      return null;
    }
    return resolved;
  }

  const book = await getPublicBook(resolved.content.meta.bookSlug);
  if (!book) {
    return null;
  }
  const chapter = findChapterByPath(book.chapters, resolved.content.path);
  if (!chapter || chapter.meta.status !== "published") {
    return null;
  }

  return {
    content: chapter,
    aliased: resolved.aliased,
    workspaceRoute: chapterWorkspaceRoute(chapter.meta.bookSlug, chapter.path),
    publicRoute: chapter.route,
  };
}

export async function resolveWorkspaceChapterRoute(
  bookSlug: string,
  chapterPathInput: string | string[],
) {
  const resolved = await resolveChapterRecord(bookSlug, chapterPathInput);
  if (!resolved) {
    return null;
  }
  return {
    book: resolved.book,
    chapter: resolved.chapter,
    aliased: resolved.aliased,
    workspaceRoute: chapterWorkspaceRoute(resolved.chapter.meta.bookSlug, resolved.chapter.path),
    publicRoute: resolved.chapter.route,
  };
}

export async function resolvePublicChapterRoute(
  bookSlug: string,
  chapterPathInput: string | string[],
) {
  const resolved = await resolveChapterRecord(bookSlug, chapterPathInput);
  if (!resolved || resolved.book.meta.status !== "published") {
    return null;
  }

  const publicBook = await getPublicBook(resolved.book.meta.slug);
  if (!publicBook) {
    return null;
  }
  const publicChapter = findChapterByPath(publicBook.chapters, resolved.chapter.path);
  if (!publicChapter || publicChapter.meta.status !== "published") {
    return null;
  }

  return {
    book: publicBook,
    chapter: publicChapter,
    aliased: resolved.aliased,
    workspaceRoute: chapterWorkspaceRoute(publicChapter.meta.bookSlug, publicChapter.path),
    publicRoute: publicChapter.route,
  };
}

const mediaUrlPattern = /\/media\/[^\s"'<>`)\]}]+/g;

function mediaError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function normalizeMediaBaseName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitMediaUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/media/")) {
    return null;
  }

  const queryIndex = trimmed.indexOf("?");
  const hashIndex = trimmed.indexOf("#");
  const splitIndex =
    queryIndex >= 0 && hashIndex >= 0
      ? Math.min(queryIndex, hashIndex)
      : Math.max(queryIndex, hashIndex);
  const canonical =
    splitIndex >= 0 ? trimmed.slice(0, splitIndex) : trimmed;
  const suffix = splitIndex >= 0 ? trimmed.slice(splitIndex) : "";

  if (canonical.length <= "/media/".length) {
    return null;
  }

  return { canonical, suffix };
}

function noteMediaPath(slug: string) {
  return `notes/${slug}`;
}

function bookMediaPath(bookSlug: string) {
  return `books/${bookSlug}`;
}

function chapterMediaPath(bookSlug: string, chapterPath: string[]) {
  return `books/${bookSlug}/chapters/${chapterPath.join("/")}`;
}

function extractMediaUrlsFromBody(body: string) {
  const urls: string[] = [];
  for (const match of body.matchAll(mediaUrlPattern)) {
    const value = match[0];
    const parts = splitMediaUrl(value);
    if (!parts) {
      continue;
    }
    urls.push(parts.canonical);
  }
  return urls;
}

function rewriteMediaDirectoryUrlsInBody(
  body: string,
  oldCanonicalPrefix: string,
  newCanonicalPrefix: string,
) {
  let replacements = 0;
  const nextBody = body.replace(mediaUrlPattern, (match) => {
    const parts = splitMediaUrl(match);
    if (!parts) {
      return match;
    }

    const exact = parts.canonical === oldCanonicalPrefix;
    const nested = parts.canonical.startsWith(`${oldCanonicalPrefix}/`);
    if (!exact && !nested) {
      return match;
    }

    replacements += 1;
    const suffixPath = exact ? "" : parts.canonical.slice(oldCanonicalPrefix.length);
    return `${newCanonicalPrefix}${suffixPath}${parts.suffix}`;
  });

  return {
    nextBody,
    replacements,
  };
}

function rewriteWikiTargetsInBody(
  body: string,
  mappings: ReadonlyMap<string, string>,
) {
  let replacements = 0;
  const nextBody = body.replace(/\[\[([^[\]]+)\]\]/g, (match, rawTarget: string) => {
    const target = String(rawTarget ?? "").trim();
    const { pageTarget, headingTarget } = splitWikiTarget(target);
    const mapped = mappings.get(pageTarget || target);
    if (!mapped) {
      return match;
    }

    replacements += 1;
    const nextTarget = headingTarget ? `${mapped}#${headingTarget}` : mapped;
    return `[[${nextTarget}]]`;
  });

  return {
    nextBody,
    replacements,
  };
}

async function moveMediaDirectory(oldRelativePath: string, newRelativePath: string) {
  if (oldRelativePath === newRelativePath) {
    return;
  }

  const oldPath = path.join(uploadsRoot, ...oldRelativePath.split("/"));
  const newPath = path.join(uploadsRoot, ...newRelativePath.split("/"));
  try {
    await fs.access(oldPath);
  } catch {
    return;
  }

  try {
    await fs.access(newPath);
    throw new Error(`Media destination already exists: ${newRelativePath}`);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code && fileError.code !== "ENOENT") {
      throw error;
    }
  }

  await ensureDirectory(path.dirname(newPath));
  await fs.rename(oldPath, newPath);
}

async function rewriteReferencesAcrossContent(
  wikiMappings: ReadonlyMap<string, string>,
  mediaMappings: ReadonlyArray<{ oldPrefix: string; newPrefix: string }>,
  excludedIds = new Set<string>(),
) {
  const records = await listAllContentRecords();

  for (const record of records) {
    if (excludedIds.has(record.id)) {
      continue;
    }

    let nextBody = record.body;
    let changed = false;

    if (wikiMappings.size > 0) {
      const rewrittenWiki = rewriteWikiTargetsInBody(nextBody, wikiMappings);
      nextBody = rewrittenWiki.nextBody;
      changed ||= rewrittenWiki.replacements > 0;
    }

    for (const mapping of mediaMappings) {
      const rewrittenMedia = rewriteMediaDirectoryUrlsInBody(
        nextBody,
        mapping.oldPrefix,
        mapping.newPrefix,
      );
      nextBody = rewrittenMedia.nextBody;
      changed ||= rewrittenMedia.replacements > 0;
    }

    if (!changed || nextBody === record.body) {
      continue;
    }

    await createRevision(record.id, record.raw);
    await writeFileAtomic(record.filePath, renderMatter(record.meta, nextBody));
  }
}

function rewriteMediaUrlsInBody(body: string, oldCanonicalUrl: string, newCanonicalUrl: string) {
  let replacements = 0;
  const nextBody = body.replace(mediaUrlPattern, (match) => {
    const parts = splitMediaUrl(match);
    if (!parts || parts.canonical !== oldCanonicalUrl) {
      return match;
    }
    replacements += 1;
    return `${newCanonicalUrl}${parts.suffix}`;
  });

  return {
    nextBody,
    replacements,
  };
}

async function findMediaReferences(url: string): Promise<MediaReference[]> {
  const records = await listAllContentRecords();
  return records
    .filter((record) => record.body.includes(url))
    .map(recordToMediaReference);
}

async function writeIndexes(content: { books: BookRecord[]; notes: NoteRecord[] }) {
  const manifest: ManifestEntry[] = [];
  const documents: SearchDocument[] = [];
  const backlinks: Record<string, ManifestEntry[]> = {};
  const aliasLookup = new Map<string, ManifestEntry | null>();
  const chapterEntries: ManifestEntry[] = [];

  const addAlias = (alias: string, entry: ManifestEntry) => {
    const existing = aliasLookup.get(alias);
    if (!existing) {
      aliasLookup.set(alias, entry);
      return;
    }

    if (existing.id !== entry.id) {
      aliasLookup.set(alias, null);
    }
  };

  for (const book of content.books) {
    const bookEntry: ManifestEntry = {
      id: book.id,
      kind: "book",
      slug: book.meta.slug,
      title: book.meta.title,
      route: book.route,
      status: book.meta.status,
      routeAliases: book.meta.routeAliases,
      summary: book.meta.description,
      headings: extractToc(book.body),
    };

    manifest.push(bookEntry);
    documents.push({
      id: book.id,
      title: book.meta.title,
      kind: "book",
      slug: book.meta.slug,
      status: book.meta.status,
      summary: book.meta.description ?? "",
      body: stripMarkdown(book.body),
      publicRoute: book.route,
      workspaceRoute: `/app/books/${book.meta.slug}`,
    });
    addAlias(bookEntry.slug, bookEntry);
    for (const alias of book.meta.routeAliases) {
      if (alias.kind === "book" || alias.kind === "note") {
        addAlias(alias.location, bookEntry);
      }
    }

    for (const chapter of flattenChapters(book.chapters)) {
      const chapterEntry: ManifestEntry = {
        id: chapter.id,
        kind: "chapter",
        slug: chapter.meta.slug,
        chapterPath: chapter.path,
        title: chapter.meta.title,
        route: chapter.route,
        status: chapter.meta.status,
        bookSlug: chapter.meta.bookSlug,
        routeAliases: chapter.meta.routeAliases,
        allowExecution: chapter.meta.allowExecution,
        summary: chapter.meta.summary,
        headings: extractToc(chapter.body),
      };

      manifest.push(chapterEntry);
      documents.push({
        id: chapter.id,
        title: chapter.meta.title,
        kind: "chapter",
        slug: chapter.meta.slug,
        bookSlug: chapter.meta.bookSlug,
        status: chapter.meta.status,
        summary: chapter.meta.summary ?? "",
        body: stripMarkdown(chapter.body),
        publicRoute: chapter.route,
        workspaceRoute: chapterWorkspaceRoute(chapter.meta.bookSlug, chapter.path),
      });
      chapterEntries.push(chapterEntry);
    }
  }

  for (const note of content.notes) {
    const noteEntry: ManifestEntry = {
      id: note.id,
      kind: "note",
      slug: note.meta.slug,
      title: note.meta.title,
      route: note.route,
      status: note.meta.status,
      routeAliases: note.meta.routeAliases,
      allowExecution: note.meta.allowExecution,
      summary: note.meta.summary,
      headings: extractToc(note.body),
    };

    manifest.push(noteEntry);
    documents.push({
      id: note.id,
      title: note.meta.title,
      kind: "note",
      slug: note.meta.slug,
      status: note.meta.status,
      summary: note.meta.summary ?? "",
      body: stripMarkdown(note.body),
      publicRoute: note.route,
      workspaceRoute: `/app/notes/${note.meta.slug}`,
    });
    addAlias(noteEntry.slug, noteEntry);
    for (const alias of note.meta.routeAliases) {
      if (alias.kind === "book" || alias.kind === "note") {
        addAlias(alias.location, noteEntry);
      }
    }
  }

  const leafAliasCount = new Map<string, number>();
  const bookLeafAliasCount = new Map<string, number>();
  const canonicalChapterAlias = (entry: ManifestEntry) =>
    `${entry.bookSlug}/${entry.chapterPath?.join("/") ?? entry.slug}`;

  for (const entry of chapterEntries) {
    const leafAlias = entry.slug;
    const bookLeafAlias = `${entry.bookSlug}/${entry.slug}`;
    leafAliasCount.set(leafAlias, (leafAliasCount.get(leafAlias) ?? 0) + 1);
    bookLeafAliasCount.set(bookLeafAlias, (bookLeafAliasCount.get(bookLeafAlias) ?? 0) + 1);
  }

  for (const entry of chapterEntries) {
    addAlias(canonicalChapterAlias(entry), entry);
    for (const alias of entry.routeAliases ?? []) {
      addAlias(alias.location, entry);
    }

    const bookLeafAlias = `${entry.bookSlug}/${entry.slug}`;
    if ((bookLeafAliasCount.get(bookLeafAlias) ?? 0) === 1) {
      addAlias(bookLeafAlias, entry);
    }

    if ((leafAliasCount.get(entry.slug) ?? 0) === 1) {
      addAlias(entry.slug, entry);
    }
  }

  const allContent = [
    ...content.books.flatMap<ContentRecord>((book) => [book, ...flattenChapters(book.chapters)]),
    ...content.notes,
  ];

  for (const item of allContent) {
    for (const target of extractWikiTargets(item.body)) {
      const { pageTarget } = splitWikiTarget(target);
      const resolved = aliasLookup.get(pageTarget || target);
      if (!resolved || resolved === null) {
        continue;
      }
      const current = backlinks[resolved.id] ?? [];
      if (!current.some((entry) => entry.id === item.id)) {
        current.push({
          id: item.id,
          kind: item.kind,
          slug: item.meta.slug,
          title: item.meta.title,
          route: item.route,
          status: item.meta.status,
          bookSlug: item.kind === "chapter" ? item.meta.bookSlug : undefined,
          chapterPath: item.kind === "chapter" ? item.path : undefined,
        });
      }
      backlinks[resolved.id] = current;
    }
  }

  const state: IndexState = {
    manifest,
    backlinks,
    search: JSON.stringify(buildSearch(documents)),
  };

  await ensureDirectory(indexesRoot);
  await fs.writeFile(indexFile("manifest.json"), JSON.stringify(state.manifest, null, 2));
  await fs.writeFile(indexFile("backlinks.json"), JSON.stringify(state.backlinks, null, 2));
  await fs.writeFile(indexFile("search.json"), state.search);
}

export async function ensureContentScaffold() {
  await Promise.all([
    ensureDirectory(booksRoot),
    ensureDirectory(notesRoot),
    ensureDirectory(revisionsRoot),
    ensureDirectory(indexesRoot),
    ensureDirectory(systemRoot),
  ]);
  await ensureSettingsFile();

  const existingBooks = await readDirectoryEntries(booksRoot);
  const existingNotes = await readDirectoryEntries(notesRoot);

  if (existingBooks.length === 0 && existingNotes.length === 0) {
    const now = new Date().toISOString();
    const sampleBookSlug = "webbook-handbook";
    const sampleBookDirectory = bookDirectory(sampleBookSlug);
    await ensureDirectory(path.join(sampleBookDirectory, "chapters"));

    const sampleBook = renderMatter(
      {
        id: nextContentId(),
        kind: "book",
        title: "WebBook Handbook",
        slug: sampleBookSlug,
        routeAliases: [],
        description: "An example book blending math, prose, and live code.",
        order: 1,
        status: "published",
        featured: true,
        coverColor: "#292118",
        theme: "paper",
        fontPreset: "source-serif",
        typography: defaultBookTypography,
        featuredAt: now,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } satisfies BookMeta,
      [
        "# Welcome to WebBook",
        "",
        "This sample book demonstrates a warm, book-like layout with math such as $e^{i\\pi} + 1 = 0$ and wiki links like [[webbook-notes]].",
        "",
        "Move into the first chapter to see runnable Python and a longer editorial page.",
      ].join("\n"),
    );

    const sampleChapter = renderMatter(
      {
        id: nextContentId(),
        kind: "chapter",
        bookSlug: sampleBookSlug,
        title: "Computational Chapter",
        slug: "computational-chapter",
        routeAliases: [],
        order: 1,
        summary: "A sample chapter that mixes prose, equations, and executable Python.",
        status: "published",
        allowExecution: true,
        fontPreset: "source-serif",
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } satisfies ChapterMeta,
      [
        "# Computational Chapter",
        "",
        "Here is a matrix identity:",
        "",
        "$$A^T A \\succeq 0$$",
        "",
        "And here is a live Python cell:",
        "",
        "```python exec id=sample-cell",
        "import sympy as sp",
        "x = sp.symbols('x')",
        "print(sp.integrate(x**2, x))",
        "```",
      ].join("\n"),
    );

    const sampleNote = renderMatter(
      {
        id: nextContentId(),
        kind: "note",
        title: "WebBook Notes",
        slug: "webbook-notes",
        routeAliases: [],
        summary: "Standalone notes can publish outside a book.",
        order: 1,
        status: "published",
        allowExecution: true,
        fontPreset: "source-serif",
        typography: defaultNoteTypography,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      } satisfies NoteMeta,
      [
        "# WebBook Notes",
        "",
        "This standalone note links back to [[webbook-handbook/computational-chapter]].",
        "",
        "```python exec id=note-cell",
        "import math",
        "print(round(math.pi, 4))",
        "```",
      ].join("\n"),
    );

    await fs.writeFile(bookFilePath(sampleBookSlug), sampleBook);
    await fs.writeFile(
      chapterFilePath(sampleBookSlug, "computational-chapter", 1),
      sampleChapter,
    );
    await fs.writeFile(noteFilePath("webbook-notes"), sampleNote);
  }

  await rebuildIndexes();
}

export async function getGeneralSettings(): Promise<GeneralSettings> {
  await ensureContentScaffold();
  try {
    const raw = await fs.readFile(settingsFilePath, "utf8");
    return saveGeneralSettingsSchema.parse(
      normalizeGeneralSettings({
        ...DEFAULT_GENERAL_SETTINGS,
        ...safeJsonParse<Record<string, unknown>>(raw, {}),
      }),
    );
  } catch {
    return normalizeGeneralSettings(DEFAULT_GENERAL_SETTINGS);
  }
}

export async function updateGeneralSettings(input: unknown) {
  await ensureContentScaffold();
  const currentSettings = await getGeneralSettings();
  const settings = saveGeneralSettingsSchema.parse(
    normalizeGeneralSettings({
      ...currentSettings,
      ...(input as Partial<GeneralSettings>),
    }),
  );
  await writeFileAtomic(settingsFilePath, JSON.stringify(settings, null, 2));
  return settings;
}

export async function exportWorkspaceArchive() {
  await ensureContentScaffold();
  await ensureUserStoreFile();
  const settings = await getGeneralSettings();
  return buildWorkspaceArchive(contentRoot, {
    maxWorkspaceBytes: workspaceTransferLimitMbToBytes(
      settings.workspaceTransferLimitMb,
    ),
  });
}

export async function importWorkspaceArchive(archiveBuffer: Buffer) {
  const settings = await getGeneralSettings();
  await restoreWorkspaceArchive(archiveBuffer, contentRoot, {
    maxArchiveBytes: workspaceTransferLimitMbToBytes(
      settings.workspaceTransferLimitMb,
    ),
    validateContentRoot: validateImportedWorkspace,
  });
  await ensureContentScaffold();
  await rebuildIndexes();
  return {
    tree: await getContentTree(),
    settings: await getGeneralSettings(),
  };
}

export async function listContent() {
  await ensureContentScaffold();
  const [books, notes] = await Promise.all([listBookRecords(), listNoteRecords()]);
  return { books, notes };
}

export async function rebuildIndexes() {
  const [books, notes] = await Promise.all([listBookRecords(), listNoteRecords()]);
  await writeIndexes({ books, notes });
}

function toContentTree(
  books: BookRecord[],
  notes: NoteRecord[],
  options?: { publicOnly?: boolean },
): ContentTree {
  const publicOnly = options?.publicOnly ?? false;
  const mapChapterTree = (
    chapters: BookRecord["chapters"],
  ): ContentTree["books"][number]["chapters"] =>
    chapters
      .filter((chapter) => !publicOnly || chapter.meta.status === "published")
      .map((chapter) => ({
        meta: chapter.meta,
        route: chapter.route,
        path: chapter.path,
        children: mapChapterTree(chapter.children),
      }));

  return {
    books: books
      .filter((book) => !publicOnly || book.meta.status === "published")
      .map((book) => ({
        meta: book.meta,
        route: book.route,
        chapters: mapChapterTree(book.chapters),
      })),
    notes: notes
      .filter((note) => !publicOnly || note.meta.status === "published")
      .map((note) => ({
        meta: note.meta,
        route: note.route,
      })),
  };
}

export async function getContentTree(): Promise<ContentTree> {
  const { books, notes } = await listContent();
  return toContentTree(books, notes);
}

export async function getPublicContentTree(): Promise<PublicContentTree> {
  const { books, notes } = await listContent();
  return toContentTree(books, notes, { publicOnly: true });
}

export async function getBook(bookSlug: string) {
  const resolved = await resolveBookRecord(bookSlug);
  if (!resolved) {
    throw new Error("Book not found");
  }
  return resolved.record;
}

export async function getChapter(bookSlug: string, chapterPathInput: string | string[]) {
  return (await resolveChapterRecord(bookSlug, chapterPathInput))?.chapter ?? null;
}

export async function getNote(slug: string) {
  return (await resolveNoteRecord(slug))?.record ?? null;
}

export async function getPublicBook(bookSlug: string) {
  return (await resolvePublicBookRoute(bookSlug))?.book ?? null;
}

export async function getPublicChapter(bookSlug: string, chapterPathInput: string | string[]) {
  const resolved = await resolvePublicChapterRoute(bookSlug, chapterPathInput);
  if (!resolved) {
    return null;
  }
  return { book: resolved.book, chapter: resolved.chapter };
}

export async function getPublicNote(slug: string) {
  const resolved = await resolvePublicNoteRoute(slug);
  return resolved?.content.kind === "note" ? resolved.content : null;
}

export async function loadIndexes() {
  await ensureContentScaffold();
  const [manifestContent, backlinksContent, searchContent] = await Promise.all([
    fs.readFile(indexFile("manifest.json"), "utf8"),
    fs.readFile(indexFile("backlinks.json"), "utf8"),
    fs.readFile(indexFile("search.json"), "utf8"),
  ]);
  return {
    manifest: safeJsonParse<ManifestEntry[]>(manifestContent, []),
    backlinks: safeJsonParse<Record<string, ManifestEntry[]>>(backlinksContent, {}),
    search: searchContent,
  };
}

export async function searchContent(query: string) {
  const { search } = await loadIndexes();
  const miniSearch = MiniSearch.loadJSON<SearchDocument>(search, {
    fields: ["title", "summary", "body"],
    storeFields: [
      "id",
      "title",
      "kind",
      "slug",
      "bookSlug",
      "status",
      "summary",
      "publicRoute",
      "workspaceRoute",
    ],
  });
  return mapSearchResults(
    miniSearch.search(query, {
      combineWith: "AND",
      prefix: true,
      fuzzy: 0.2,
    }),
    "workspace",
  );
}

export async function getBacklinks(id: string) {
  const { backlinks } = await loadIndexes();
  return backlinks[id] ?? [];
}

export async function getManifest() {
  const { manifest } = await loadIndexes();
  return manifest;
}

export async function searchPublicContent(query: string) {
  const { manifest, search } = await loadIndexes();
  const publicIds = new Set(filterPublishedManifestEntries(manifest).map((entry) => entry.id));
  const miniSearch = MiniSearch.loadJSON<SearchDocument>(search, {
    fields: ["title", "summary", "body"],
    storeFields: [
      "id",
      "title",
      "kind",
      "slug",
      "bookSlug",
      "status",
      "summary",
      "publicRoute",
      "workspaceRoute",
    ],
  });

  return mapSearchResults(
    miniSearch
      .search(query, {
        combineWith: "AND",
        prefix: true,
        fuzzy: 0.2,
      })
      .filter((result) => publicIds.has(String(result.id))),
    "public",
  );
}

export async function getPublicBacklinks(id: string) {
  const { backlinks } = await loadIndexes();
  return filterPublishedManifestEntries(backlinks[id] ?? []);
}

export async function getPublicManifest() {
  const { manifest } = await loadIndexes();
  return filterPublishedManifestEntries(manifest);
}

export async function unresolvedWikiLinks(markdown: string) {
  const manifest = await getManifest();
  const aliasLookup = buildManifestAliasLookup(manifest);

  return extractWikiTargets(markdown).filter((target) => {
    const { pageTarget, headingTarget } = splitWikiTarget(target);
    const resolved = aliasLookup.get(pageTarget || target);
    if (!resolved || resolved === null) {
      return true;
    }

    if (!headingTarget) {
      return false;
    }

    const normalizedHeading = headingId(headingTarget);
    return !resolved.headings?.some(
      (heading) =>
        heading.id === normalizedHeading ||
        headingId(heading.value) === normalizedHeading,
    );
  });
}

async function createRevision(id: string, raw: string) {
  const directoryPath = path.join(revisionsRoot, id.replace(/[/:]/g, "_"));
  await ensureDirectory(directoryPath);
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
  await fs.writeFile(path.join(directoryPath, fileName), raw);
}

export async function listRevisions(id: string) {
  const resolvedId = (await getContentById(id))?.id ?? id;
  const directoryPath = path.join(revisionsRoot, resolvedId.replace(/[/:]/g, "_"));
  const entries = await readDirectoryEntries(directoryPath);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 20);
}

export async function createBook(input: unknown) {
  const data = saveBookSchema.parse(input);
  const slug = toSlug(data.slug);
  ensureSafeSlugOrThrow(slug);
  const existingBooks = await listOrderedBookFiles();
  if (existingBooks.some((book) => book.slug === slug)) {
    throw new Error("A book with that slug already exists");
  }

  const now = new Date().toISOString();
  const nextOrder =
    existingBooks.reduce(
      (highestOrder, book) => Math.max(highestOrder, book.order ?? 0),
      0,
    ) + 1;
  const directoryPath = bookDirectory(slug);
  await ensureDirectory(path.join(directoryPath, "chapters"));
  const raw = renderMatter(
    {
      id: nextContentId(),
      kind: "book",
      title: data.title,
      slug,
      routeAliases: [],
      description: data.description,
      order: nextOrder,
      status: data.status,
      featured: data.featured,
      coverColor: data.coverColor,
      featuredAt: data.featured ? now : undefined,
      fontPreset: data.fontPreset,
      typography: normalizeBookTypography(data.typography),
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === "published" ? now : undefined,
    } satisfies BookMeta,
    data.body,
  );
  await fs.writeFile(bookFilePath(slug), raw, { encoding: "utf8", flag: "wx" });
  if (data.featured) {
    await enforceFeaturedBookLimit();
  }
  await rebuildIndexes();
  return getBook(slug);
}

export async function updateBook(bookSlug: string, input: unknown) {
  const existing = await getBook(bookSlug);
  if (!existing) {
    throw new Error("Book not found");
  }
  const data = saveBookSchema.parse(input);
  const now = new Date().toISOString();
  const nextSlug = toSlug(data.slug);
  ensureSafeSlugOrThrow(nextSlug);
  const existingBooks = await listOrderedBookFiles();
  if (
    nextSlug !== existing.meta.slug &&
    existingBooks.some((entry) => entry.slug === nextSlug)
  ) {
    throw new Error("A book with that slug already exists");
  }
  const nextMeta = {
    ...existing.meta,
    title: data.title,
    slug: nextSlug,
    routeAliases:
      nextSlug === existing.meta.slug
        ? existing.meta.routeAliases
        : withRouteAlias(existing.meta, {
            kind: "book",
            location: existing.meta.slug,
          }).routeAliases,
    description: data.description,
    status: data.status,
    featured: data.featured,
    coverColor: data.coverColor,
    featuredAt: data.featured
      ? existing.meta.featured
        ? existing.meta.featuredAt ?? now
        : now
      : undefined,
    fontPreset: data.fontPreset,
    typography: normalizeBookTypography(data.typography ?? existing.meta.typography),
    updatedAt: now,
    publishedAt:
      data.status === "published"
        ? existing.meta.publishedAt ?? now
        : undefined,
  } satisfies BookMeta;
  const raw = renderMatter(
    nextMeta,
    data.body,
  );
  if (data.createRevision) {
    await createRevision(existing.id, existing.raw);
  }
  if (nextSlug !== existing.meta.slug) {
    const nextDirectory = bookDirectory(nextSlug);
    try {
      await fs.access(nextDirectory);
      throw new Error("A book with that slug already exists");
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code && fileError.code !== "ENOENT") {
        throw error;
      }
    }

    await createRevision(existing.id, existing.raw);
    for (const chapter of flattenChapters(existing.chapters)) {
      await createRevision(chapter.id, chapter.raw);
    }

    const wikiMappings = new Map<string, string>([[existing.meta.slug, nextSlug]]);
    for (const chapter of flattenChapters(existing.chapters)) {
      wikiMappings.set(
        chapterLocation(existing.meta.slug, chapter.path),
        chapterLocation(nextSlug, chapter.path),
      );
    }

    await fs.rename(bookDirectory(existing.meta.slug), nextDirectory);
    await writeFileAtomic(bookFilePath(nextSlug), raw);
    await rewriteBookChapterMetadataForRename(
      path.join(nextDirectory, "chapters"),
      existing.meta.slug,
      nextSlug,
      now,
    );
    await moveMediaDirectory(bookMediaPath(existing.meta.slug), bookMediaPath(nextSlug));
    await rewriteReferencesAcrossContent(
      wikiMappings,
      [
        {
          oldPrefix: `/media/${bookMediaPath(existing.meta.slug)}`,
          newPrefix: `/media/${bookMediaPath(nextSlug)}`,
        },
      ],
    );
  } else {
    await writeFileAtomic(existing.filePath, raw);
  }
  if (data.featured) {
    await enforceFeaturedBookLimit();
  }
  await rebuildIndexes();
  return getBook(nextSlug);
}

export async function createChapter(bookSlug: string, input: unknown) {
  ensureSafeSlugOrThrow(bookSlug);
  const data = createChapterSchema.parse(input);
  const requestedParentChapterPath = normalizeChapterPathInput(data.parentChapterPath);
  const {
    canonicalBookSlug,
    parentChapterPath,
    chaptersPath,
  } = await resolveParentChaptersPath(bookSlug, requestedParentChapterPath);
  const slug = toSlug(data.slug);
  ensureSafeSlugOrThrow(slug);
  const chapterEntries = await listOrderedChapterFilesAtPath(chaptersPath);
  if (chapterEntries.some((chapter) => chapter.slug === slug)) {
    throw new Error("A chapter with that slug already exists in this book");
  }
  if (chapterEntries.some((chapter) => chapter.order === data.order)) {
    throw new Error(`A chapter already uses order ${data.order}`);
  }
  const now = new Date().toISOString();
  const raw = renderMatter(
    {
      id: nextContentId(),
      kind: "chapter",
      bookSlug: canonicalBookSlug,
      title: data.title,
      slug,
      routeAliases: [],
      order: data.order,
      summary: data.summary,
      status: data.status,
      allowExecution: data.allowExecution,
      fontPreset: data.fontPreset,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === "published" ? now : undefined,
    } satisfies ChapterMeta,
    data.body,
  );
  const filePath = path.join(chaptersPath, `${chapterStem(data.order, slug)}.md`);
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, raw, {
    encoding: "utf8",
    flag: "wx",
  });
  await rebuildIndexes();
  return parseChapterFile(filePath, canonicalBookSlug, [...parentChapterPath, slug]);
}

function assertChapterContentOnlyUpdate(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return;
  }
  const payload = input as Record<string, unknown>;
  if ("order" in payload || "parentChapterPath" in payload) {
    throw new Error(CHAPTER_MOVE_ENDPOINT_HINT);
  }
}

export async function updateChapterContent(
  bookSlug: string,
  chapterPathInput: string | string[],
  input: unknown,
) {
  ensureSafeSlugOrThrow(bookSlug);
  assertChapterContentOnlyUpdate(input);
  const chapterPath = normalizeChapterPathInput(chapterPathInput);
  const locationResolution = await resolveChapterEntryLocation(bookSlug, chapterPath);
  if (!locationResolution.ok) {
    if (locationResolution.reason === "ambiguous") {
      throw new Error("Chapter path is ambiguous");
    }
    throw new Error("Chapter not found");
  }

  const { location } = locationResolution;
  const canonicalBookSlug = locationResolution.canonicalBookSlug;
  const chapterEntries = await listOrderedChapterFilesAtPath(location.chaptersPath);
  const existingEntry =
    chapterEntries.find((chapter) => chapter.filePath === location.entry.filePath) ?? null;
  if (!existingEntry) {
    throw new Error("Chapter not found");
  }

  const existing = await parseChapterFile(
    existingEntry.filePath,
    canonicalBookSlug,
    location.chapterPath,
  );
  const data = updateChapterContentSchema.parse(input);
  const currentParentPath = location.chapterPath.slice(0, -1);

  const now = new Date().toISOString();
  const nextSlug = toSlug(data.slug);
  ensureSafeSlugOrThrow(nextSlug);
  if (
    chapterEntries.some(
      (chapter) =>
        chapter.slug === nextSlug && chapter.filePath !== existingEntry.filePath,
    )
  ) {
    throw new Error("A chapter with that slug already exists in this book");
  }
  const nextMeta = {
    ...existing.meta,
    title: data.title,
    slug: nextSlug,
    routeAliases:
      nextSlug === existing.meta.slug
        ? existing.meta.routeAliases
        : withRouteAlias(existing.meta, {
            kind: "chapter",
            location: chapterLocation(canonicalBookSlug, location.chapterPath),
          }).routeAliases,
    order: existingEntry.order,
    summary: data.summary,
    status: data.status,
    allowExecution: data.allowExecution,
    fontPreset: data.fontPreset,
    updatedAt: now,
    publishedAt:
      data.status === "published"
        ? existing.meta.publishedAt ?? now
        : undefined,
  } satisfies ChapterMeta;
  const raw = renderMatter(nextMeta, data.body);
  const requiresRename = nextSlug !== existingEntry.slug;

  if (requiresRename) {
    const reorderedChapters = chapterEntries.filter(
      (chapter) => chapter.filePath !== existingEntry.filePath,
    );

    reorderedChapters.splice(existingEntry.order - 1, 0, {
      ...existingEntry,
      slug: nextSlug,
      order: existingEntry.order,
    });

    const parentDirectory = path.dirname(location.chaptersPath);
    const currentChaptersPath = location.chaptersPath;
    const stagingPath = path.join(parentDirectory, `.chapters-update-${Date.now()}`);
    const backupPath = path.join(parentDirectory, `.chapters-backup-${Date.now()}`);

    await ensureDirectory(stagingPath);

    for (const chapter of chapterEntries) {
      const chapterRaw = await fs.readFile(chapter.filePath, "utf8");
      await createRevision(
        contentIdFromRaw(
          "chapter",
          chapterRaw,
          chapterLocation(canonicalBookSlug, [...currentParentPath, chapter.slug]),
        ),
        chapterRaw,
      );
    }

    for (const [index, chapter] of reorderedChapters.entries()) {
      const isUpdatedChapter = chapter.filePath === existingEntry.filePath;
      const nextChapterSlug = isUpdatedChapter ? nextSlug : chapter.slug;
      const nextOrder = index + 1;
      const sourceChapter = isUpdatedChapter ? existingEntry : chapter;
      const nextPath = path.join(
        stagingPath,
        `${chapterStem(nextOrder, nextChapterSlug)}.md`,
      );

      if (isUpdatedChapter) {
        const chapterMeta = {
          ...nextMeta,
          order: nextOrder,
          updatedAt: now,
        } satisfies ChapterMeta;
        await fs.writeFile(nextPath, renderMatter(chapterMeta, data.body), "utf8");
      } else {
        const rawChapter = await fs.readFile(chapter.filePath, "utf8");
        const nextRaw = rewriteFrontMatterScalar(
          rewriteFrontMatterScalar(rawChapter, "order", nextOrder),
          "updatedAt",
          now,
        );
        await fs.writeFile(nextPath, nextRaw, "utf8");
      }

      await copyChapterSubtree(
        currentChaptersPath,
        sourceChapter,
        stagingPath,
        nextOrder,
        nextChapterSlug,
      );
    }

    await fs.rename(currentChaptersPath, backupPath);

    try {
      await fs.rename(stagingPath, currentChaptersPath);
    } catch (error) {
      await fs.rename(backupPath, currentChaptersPath).catch(() => undefined);
      await fs.rm(stagingPath, { recursive: true, force: true });
      throw error;
    }

    await fs.rm(backupPath, { recursive: true, force: true });
    const wikiMappings = new Map<string, string>();
    for (const chapter of [existing, ...flattenChapters(existing.children)]) {
      const relative = chapter.path.slice(location.chapterPath.length);
      const nextPathAlias = [...currentParentPath, nextSlug, ...relative];
      wikiMappings.set(
        chapterLocation(canonicalBookSlug, chapter.path),
        chapterLocation(canonicalBookSlug, nextPathAlias),
      );
    }
    await moveMediaDirectory(
      chapterMediaPath(canonicalBookSlug, location.chapterPath),
      chapterMediaPath(canonicalBookSlug, [...currentParentPath, nextSlug]),
    );
    await rewriteReferencesAcrossContent(
      wikiMappings,
      [
        {
          oldPrefix: `/media/${chapterMediaPath(canonicalBookSlug, location.chapterPath)}`,
          newPrefix: `/media/${chapterMediaPath(canonicalBookSlug, [...currentParentPath, nextSlug])}`,
        },
      ],
    );
    await rebuildIndexes();
    const canonicalPath = [...currentParentPath, nextSlug];
    return parseChapterFile(
      path.join(currentChaptersPath, `${chapterStem(existingEntry.order, nextSlug)}.md`),
      canonicalBookSlug,
      canonicalPath,
    );
  }

  if (data.createRevision) {
    await createRevision(existing.id, existing.raw);
  }
  await writeFileAtomic(existing.filePath, raw);
  await rebuildIndexes();
  return parseChapterFile(existing.filePath, canonicalBookSlug, location.chapterPath);
}

export async function updateChapter(
  bookSlug: string,
  chapterPathInput: string | string[],
  input: unknown,
) {
  return updateChapterContent(bookSlug, chapterPathInput, input);
}

export async function moveChapter(bookSlug: string, input: unknown) {
  ensureSafeSlugOrThrow(bookSlug);
  const data = moveChapterSchema.parse(input);
  const chapterPath = normalizeChapterPathInput(data.chapterPath);
  const requestedDestinationBookSlug = toSlug(data.destinationBookSlug ?? bookSlug);
  ensureSafeSlugOrThrow(requestedDestinationBookSlug);
  const destinationParentPath = normalizeChapterPathInput(data.parentChapterPath);
  const sourceResolution = await resolveChapterEntryLocation(bookSlug, chapterPath);
  if (!sourceResolution.ok) {
    if (sourceResolution.reason === "ambiguous") {
      throw new Error("Chapter path is ambiguous");
    }
    throw new Error("Chapter not found");
  }
  const canonicalBookSlug = sourceResolution.canonicalBookSlug;
  const destinationBookResolution = await resolveBookRecord(requestedDestinationBookSlug);
  if (!destinationBookResolution) {
    throw new Error("Destination book not found");
  }
  const destinationBookSlug = destinationBookResolution.record.meta.slug;
  const canonicalChapterPath = sourceResolution.location.chapterPath;
  const canonicalDestinationParentPath = destinationParentPath.length
    ? await (async () => {
        const destinationResolution = await resolveChapterEntryLocation(
          destinationBookSlug,
          destinationParentPath,
        );
        if (!destinationResolution.ok) {
          if (destinationResolution.reason === "ambiguous") {
            throw new Error("Parent chapter path is ambiguous");
          }
          throw new Error("Destination parent chapter not found");
        }
        return destinationResolution.location.chapterPath;
      })()
    : [];
  const loadChapterByPath = async (pathInput: string[]) => {
    const resolution = await resolveChapterEntryLocation(destinationBookSlug, pathInput);
    if (!resolution.ok) {
      if (resolution.reason === "ambiguous") {
        throw new Error("Chapter path is ambiguous");
      }
      return null;
    }
    return parseChapterFile(
      resolution.location.entry.filePath,
      resolution.canonicalBookSlug,
      resolution.location.chapterPath,
    );
  };
  if (!canonicalChapterPath.length) {
    throw new Error("Chapter path is required");
  }

  if (
    canonicalBookSlug === destinationBookSlug &&
    chapterPathStartsWith(canonicalDestinationParentPath, canonicalChapterPath)
  ) {
    throw new Error("Cannot move a chapter into itself or its descendants");
  }

  const existingChapter = await parseChapterFile(
    sourceResolution.location.entry.filePath,
    canonicalBookSlug,
    canonicalChapterPath,
  );
  const sourceParentPath = canonicalChapterPath.slice(0, -1);
  const movingSlug = canonicalChapterPath[canonicalChapterPath.length - 1];
  if (!movingSlug) {
    throw new Error("Chapter not found");
  }

  const sourceRootChaptersPath = path.join(bookDirectory(canonicalBookSlug), "chapters");
  const destinationRootChaptersPath = path.join(bookDirectory(destinationBookSlug), "chapters");
  const sourceChapterTree = await loadChapterFileTree(sourceRootChaptersPath, []);
  const destinationChapterTree =
    canonicalBookSlug === destinationBookSlug
      ? sourceChapterTree
      : await loadChapterFileTree(destinationRootChaptersPath, []);

  const sourceSiblings = findChapterFileSiblingsByParentPath(
    sourceChapterTree,
    sourceParentPath,
  );
  if (!sourceSiblings) {
    throw new Error("Chapter not found");
  }

  const sourceIndex = sourceSiblings.findIndex((chapter) => chapter.slug === movingSlug);
  if (sourceIndex < 0) {
    throw new Error("Chapter not found");
  }

  const destinationSiblingsBeforeMove = findChapterFileSiblingsByParentPath(
    destinationChapterTree,
    canonicalDestinationParentPath,
  );
  if (!destinationSiblingsBeforeMove) {
    throw new Error("Destination parent chapter not found");
  }

  const sameParent =
    canonicalBookSlug === destinationBookSlug &&
    chapterPathsEqual(sourceParentPath, canonicalDestinationParentPath);
  if (sameParent && data.order === undefined) {
    const currentChapter = await loadChapterByPath(canonicalChapterPath);
    if (!currentChapter) {
      throw new Error("Chapter not found");
    }
    return currentChapter;
  }

  const requestedOrder = data.order ?? destinationSiblingsBeforeMove.length + 1;
  if (requestedOrder < 1 || requestedOrder > destinationSiblingsBeforeMove.length + 1) {
    throw new Error(
      `Destination chapter order must be between 1 and ${destinationSiblingsBeforeMove.length + 1}`,
    );
  }

  if (sameParent && requestedOrder === sourceIndex + 1) {
    const currentChapter = await loadChapterByPath(canonicalChapterPath);
    if (!currentChapter) {
      throw new Error("Chapter not found");
    }
    return currentChapter;
  }

  const revisionCandidates = new Map<string, { id: string; raw: string }>();
  for (const chapter of sourceSiblings) {
    const chapterId = contentIdFromRaw(
      "chapter",
      chapter.raw,
      chapterLocation(canonicalBookSlug, chapter.path),
    );
    revisionCandidates.set(
      `${canonicalBookSlug}:${chapter.path.join("/")}`,
      { id: chapterId, raw: chapter.raw },
    );
  }
  for (const chapter of destinationSiblingsBeforeMove) {
    const chapterId = contentIdFromRaw(
      "chapter",
      chapter.raw,
      chapterLocation(destinationBookSlug, chapter.path),
    );
    revisionCandidates.set(
      `${destinationBookSlug}:${chapter.path.join("/")}`,
      { id: chapterId, raw: chapter.raw },
    );
  }

  const [movedChapter] = sourceSiblings.splice(sourceIndex, 1);
  const destinationSiblingsAfterRemoval = findChapterFileSiblingsByParentPath(
    destinationChapterTree,
    canonicalDestinationParentPath,
  );
  if (!destinationSiblingsAfterRemoval) {
    throw new Error("Destination parent chapter not found");
  }

  if (
    destinationSiblingsAfterRemoval.some((chapter) => chapter.slug === movedChapter.slug)
  ) {
    throw new Error("A chapter with that slug already exists in the destination");
  }

  const insertionIndex = Math.min(requestedOrder - 1, destinationSiblingsAfterRemoval.length);
  destinationSiblingsAfterRemoval.splice(insertionIndex, 0, movedChapter);

  const now = new Date().toISOString();
  const routeChanged =
    canonicalBookSlug !== destinationBookSlug ||
    !chapterPathsEqual(sourceParentPath, canonicalDestinationParentPath);
  for (const chapter of revisionCandidates.values()) {
    await createRevision(chapter.id, chapter.raw);
  }

  if (routeChanged || canonicalBookSlug !== destinationBookSlug) {
    rewriteMovedChapterTree(movedChapter, canonicalBookSlug, destinationBookSlug, now);
  }

  renumberChapterFileSiblings(sourceSiblings, now);
  if (destinationSiblingsAfterRemoval !== sourceSiblings) {
    renumberChapterFileSiblings(destinationSiblingsAfterRemoval, now);
  }

  const movedPath = [...canonicalDestinationParentPath, movedChapter.slug];
  await replaceBookChaptersDirectoryFromFileTree(canonicalBookSlug, sourceChapterTree);
  if (destinationChapterTree !== sourceChapterTree) {
    await replaceBookChaptersDirectoryFromFileTree(destinationBookSlug, destinationChapterTree);
  }

  if (routeChanged) {
    const wikiMappings = new Map<string, string>();
    for (const chapter of [existingChapter, ...flattenChapters(existingChapter.children)]) {
      const relative = chapter.path.slice(canonicalChapterPath.length);
      wikiMappings.set(
        chapterLocation(canonicalBookSlug, chapter.path),
        chapterLocation(destinationBookSlug, [...movedPath, ...relative]),
      );
    }
    await moveMediaDirectory(
      chapterMediaPath(canonicalBookSlug, canonicalChapterPath),
      chapterMediaPath(destinationBookSlug, movedPath),
    );
    await rewriteReferencesAcrossContent(
      wikiMappings,
      [
        {
          oldPrefix: `/media/${chapterMediaPath(canonicalBookSlug, canonicalChapterPath)}`,
          newPrefix: `/media/${chapterMediaPath(destinationBookSlug, movedPath)}`,
        },
      ],
    );
  }

  await rebuildIndexes();
  const moved = await loadChapterByPath(movedPath);
  if (!moved) {
    throw new Error("Chapter move failed");
  }
  return moved;
}

export async function reorderBookChapters(bookSlug: string, input: unknown) {
  ensureSafeSlugOrThrow(bookSlug);
  const data = reorderChaptersSchema.parse(input);
  const requestedParentChapterPath = normalizeChapterPathInput(data.parentChapterPath);
  const {
    canonicalBookSlug,
    parentChapterPath,
    chaptersPath: currentChaptersPath,
  } = await resolveParentChaptersPath(bookSlug, requestedParentChapterPath);
  const chapterEntries = await listOrderedChapterFilesAtPath(currentChaptersPath);
  const chapterMap = new Map(chapterEntries.map((chapter) => [chapter.slug, chapter] as const));
  const uniqueSlugs = new Set(data.chapterSlugs);

  if (
    data.chapterSlugs.length !== chapterEntries.length ||
    uniqueSlugs.size !== chapterEntries.length
  ) {
    throw new Error("Chapter reorder payload does not match the current book");
  }

  for (const slug of data.chapterSlugs) {
    ensureSafeSlugOrThrow(slug);
    if (!chapterMap.has(slug)) {
      throw new Error(`Unknown chapter slug: ${slug}`);
    }
  }

  const now = new Date().toISOString();
  const parentDirectory = path.dirname(currentChaptersPath);
  const stagingPath = path.join(parentDirectory, `.chapters-reorder-${Date.now()}`);
  const backupPath = path.join(parentDirectory, `.chapters-backup-${Date.now()}`);

  await ensureDirectory(stagingPath);

  for (const chapter of chapterEntries) {
    const chapterRaw = await fs.readFile(chapter.filePath, "utf8");
    await createRevision(
      contentIdFromRaw(
        "chapter",
        chapterRaw,
        chapterLocation(canonicalBookSlug, [...parentChapterPath, chapter.slug]),
      ),
      chapterRaw,
    );
  }

  for (const [index, slug] of data.chapterSlugs.entries()) {
    const chapter = chapterMap.get(slug);
    if (!chapter) {
      throw new Error(`Unknown chapter slug: ${slug}`);
    }

    const nextOrder = index + 1;
    const raw = await fs.readFile(chapter.filePath, "utf8");
    const nextRaw = rewriteFrontMatterScalar(
      rewriteFrontMatterScalar(raw, "order", nextOrder),
      "updatedAt",
      now,
    );

    await fs.writeFile(
      path.join(stagingPath, `${chapterStem(nextOrder, slug)}.md`),
      nextRaw,
      "utf8",
    );
    await copyChapterSubtree(currentChaptersPath, chapter, stagingPath, nextOrder, slug);
  }

  await fs.rename(currentChaptersPath, backupPath);

  try {
    await fs.rename(stagingPath, currentChaptersPath);
  } catch (error) {
    await fs.rename(backupPath, currentChaptersPath);
    await fs.rm(stagingPath, { recursive: true, force: true });
    throw error;
  }

  await fs.rm(backupPath, { recursive: true, force: true });
  await rebuildIndexes();
  try {
    return await getBook(canonicalBookSlug);
  } catch {
    return null;
  }
}

export async function reorderBooks(input: unknown) {
  const data = reorderBooksSchema.parse(input);
  const books = await listOrderedBookFiles();
  const bookMap = new Map(books.map((book) => [book.slug, book] as const));
  const uniqueSlugs = new Set(data.bookSlugs);

  if (data.bookSlugs.length !== books.length || uniqueSlugs.size !== books.length) {
    throw new Error("Book reorder payload does not match the current workspace");
  }

  for (const slug of data.bookSlugs) {
    ensureSafeSlugOrThrow(slug);
    if (!bookMap.has(slug)) {
      throw new Error(`Unknown book slug: ${slug}`);
    }
  }

  const now = new Date().toISOString();

  await Promise.all(
    data.bookSlugs.map(async (slug, index) => {
      const book = bookMap.get(slug);
      if (!book) {
        throw new Error(`Unknown book slug: ${slug}`);
      }

      const raw = await fs.readFile(book.filePath, "utf8");
      const nextRaw = rewriteFrontMatterScalar(
        rewriteFrontMatterScalar(raw, "order", index + 1),
        "updatedAt",
        now,
      );
      await writeFileAtomic(book.filePath, nextRaw);
    }),
  );

  await rebuildIndexes();
  return getContentTree();
}

export async function reorderNotes(input: unknown) {
  const data = reorderNotesSchema.parse(input);
  const notes = await listOrderedNoteFiles();
  const noteMap = new Map(notes.map((note) => [note.slug, note] as const));
  const uniqueSlugs = new Set(data.noteSlugs);

  if (data.noteSlugs.length !== notes.length || uniqueSlugs.size !== notes.length) {
    throw new Error("Note reorder payload does not match the current workspace");
  }

  for (const slug of data.noteSlugs) {
    ensureSafeSlugOrThrow(slug);
    if (!noteMap.has(slug)) {
      throw new Error(`Unknown note slug: ${slug}`);
    }
  }

  const now = new Date().toISOString();

  await Promise.all(
    data.noteSlugs.map(async (slug, index) => {
      const note = noteMap.get(slug);
      if (!note) {
        throw new Error(`Unknown note slug: ${slug}`);
      }

      const raw = await fs.readFile(note.filePath, "utf8");
      const nextRaw = rewriteFrontMatterScalar(
        rewriteFrontMatterScalar(raw, "order", index + 1),
        "updatedAt",
        now,
      );
      await writeFileAtomic(note.filePath, nextRaw);
    }),
  );

  await rebuildIndexes();
  return getContentTree();
}

export async function createNote(input: unknown) {
  const data = saveNoteSchema.parse(input);
  const slug = toSlug(data.slug);
  ensureSafeSlugOrThrow(slug);
  const existingNotes = await listOrderedNoteFiles();
  if (existingNotes.some((note) => note.slug === slug)) {
    throw new Error("A note with that slug already exists");
  }

  const now = new Date().toISOString();
  const nextOrder =
    existingNotes.reduce(
      (highestOrder, note) => Math.max(highestOrder, note.order ?? 0),
      0,
    ) + 1;
  const raw = renderMatter(
    {
      id: nextContentId(),
      kind: "note",
      title: data.title,
      slug,
      routeAliases: [],
      summary: data.summary,
      order: nextOrder,
      status: data.status,
      allowExecution: data.allowExecution,
      fontPreset: data.fontPreset,
      typography: normalizeBookTypography(data.typography, defaultNoteTypography),
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === "published" ? now : undefined,
    } satisfies NoteMeta,
    data.body,
  );
  await fs.writeFile(noteFilePath(slug), raw, { encoding: "utf8", flag: "wx" });
  await rebuildIndexes();
  return getNote(slug);
}

export async function updateNote(slug: string, input: unknown) {
  const existing = await getNote(slug);
  if (!existing) {
    throw new Error("Note not found");
  }
  const data = saveNoteSchema.parse(input);
  const now = new Date().toISOString();
  const nextSlug = toSlug(data.slug);
  ensureSafeSlugOrThrow(nextSlug);
  const existingNotes = await listOrderedNoteFiles();
  if (
    nextSlug !== existing.meta.slug &&
    existingNotes.some((entry) => entry.slug === nextSlug)
  ) {
    throw new Error("A note with that slug already exists");
  }
  const nextMeta = {
    ...existing.meta,
    title: data.title,
    slug: nextSlug,
    routeAliases:
      nextSlug === existing.meta.slug
        ? existing.meta.routeAliases
        : withRouteAlias(existing.meta, {
            kind: "note",
            location: existing.meta.slug,
          }).routeAliases,
    summary: data.summary,
    status: data.status,
    allowExecution: data.allowExecution,
    fontPreset: data.fontPreset,
    typography: normalizeBookTypography(
      data.typography ?? existing.meta.typography,
      defaultNoteTypography,
    ),
    updatedAt: now,
    publishedAt:
      data.status === "published"
        ? existing.meta.publishedAt ?? now
        : undefined,
  } satisfies NoteMeta;
  const raw = renderMatter(
    nextMeta,
    data.body,
  );
  if (data.createRevision) {
    await createRevision(existing.id, existing.raw);
  }
  if (nextSlug !== existing.meta.slug) {
    await fs.writeFile(noteFilePath(nextSlug), raw, { encoding: "utf8", flag: "wx" });
    await fs.rm(existing.filePath, { force: true });
    await moveMediaDirectory(noteMediaPath(existing.meta.slug), noteMediaPath(nextSlug));
    await rewriteReferencesAcrossContent(
      new Map([[existing.meta.slug, nextSlug]]),
      [
        {
          oldPrefix: `/media/${noteMediaPath(existing.meta.slug)}`,
          newPrefix: `/media/${noteMediaPath(nextSlug)}`,
        },
      ],
    );
  } else {
    await writeFileAtomic(existing.filePath, raw);
  }
  await rebuildIndexes();
  return getNote(nextSlug);
}

export async function moveNoteToBook(slug: string, input: unknown) {
  const existing = await getNote(slug);
  if (!existing) {
    throw new Error("Note not found");
  }

  const data = moveNoteToBookSchema.parse(input);
  const destinationBookSlug = toSlug(data.destinationBookSlug);
  ensureSafeSlugOrThrow(destinationBookSlug);

  const requestedParentChapterPath = normalizeChapterPathInput(data.parentChapterPath);
  const {
    canonicalBookSlug,
    parentChapterPath,
    chaptersPath: destinationChaptersPath,
  } = await resolveParentChaptersPath(
    destinationBookSlug,
    requestedParentChapterPath,
  );
  const chapterEntries = await listOrderedChapterFilesAtPath(destinationChaptersPath);
  if (chapterEntries.some((chapter) => chapter.slug === existing.meta.slug)) {
    throw new Error("A chapter with that slug already exists in this destination");
  }

  const requestedOrder = data.order ?? chapterEntries.length + 1;
  if (requestedOrder < 1 || requestedOrder > chapterEntries.length + 1) {
    throw new Error(
      `Destination chapter order must be between 1 and ${chapterEntries.length + 1}`,
    );
  }

  const now = new Date().toISOString();
  await createRevision(existing.id, existing.raw);
  for (const chapter of chapterEntries) {
    const chapterRaw = await fs.readFile(chapter.filePath, "utf8");
    await createRevision(
      contentIdFromRaw(
        "chapter",
        chapterRaw,
        chapterLocation(canonicalBookSlug, [...parentChapterPath, chapter.slug]),
      ),
      chapterRaw,
    );
  }

  const parentDirectory = path.dirname(destinationChaptersPath);
  const stagingPath = path.join(parentDirectory, `.chapters-note-move-${Date.now()}`);
  const backupPath = path.join(parentDirectory, `.chapters-backup-${Date.now()}`);
  await ensureDirectory(stagingPath);

  const insertedPath = [...parentChapterPath, existing.meta.slug];
  for (let index = 0; index < chapterEntries.length + 1; index += 1) {
    const nextOrder = index + 1;
    if (index === requestedOrder - 1) {
      const nextPath = path.join(
        stagingPath,
        `${chapterStem(nextOrder, existing.meta.slug)}.md`,
      );
      const nextMeta: ChapterMeta = {
        id: existing.meta.id,
        kind: "chapter",
        bookSlug: canonicalBookSlug,
        title: existing.meta.title,
        slug: existing.meta.slug,
        routeAliases: normalizeRouteAliases([
          ...existing.meta.routeAliases,
          { kind: "note", location: existing.meta.slug },
        ]),
        order: nextOrder,
        summary: existing.meta.summary,
        status: existing.meta.status,
        allowExecution: existing.meta.allowExecution,
        fontPreset: existing.meta.fontPreset,
        createdAt: existing.meta.createdAt,
        updatedAt: now,
        publishedAt: existing.meta.publishedAt,
      };
      await fs.writeFile(nextPath, renderMatter(nextMeta, existing.body), "utf8");
      continue;
    }

    const sourceIndex = index < requestedOrder - 1 ? index : index - 1;
    const chapter = chapterEntries[sourceIndex];
    const nextPath = path.join(
      stagingPath,
      `${chapterStem(nextOrder, chapter.slug)}.md`,
    );
    const raw = await fs.readFile(chapter.filePath, "utf8");
    const nextRaw = rewriteFrontMatterScalar(
      rewriteFrontMatterScalar(raw, "order", nextOrder),
      "updatedAt",
      now,
    );
    await fs.writeFile(nextPath, nextRaw, "utf8");
    await copyChapterSubtree(
      destinationChaptersPath,
      chapter,
      stagingPath,
      nextOrder,
      chapter.slug,
    );
  }

  await fs.rename(destinationChaptersPath, backupPath);
  try {
    await fs.rename(stagingPath, destinationChaptersPath);
  } catch (error) {
    await fs.rename(backupPath, destinationChaptersPath).catch(() => undefined);
    await fs.rm(stagingPath, { recursive: true, force: true });
    throw error;
  }
  await fs.rm(backupPath, { recursive: true, force: true });

  await fs.rm(existing.filePath, { force: true });
  const notes = await listOrderedNoteFiles();
  await Promise.all(
    notes
      .filter((entry) => entry.slug !== existing.meta.slug)
      .map((entry, index) =>
        fs.readFile(entry.filePath, "utf8").then((raw) =>
          writeFileAtomic(
            entry.filePath,
            rewriteFrontMatterScalar(
              rewriteFrontMatterScalar(raw, "order", index + 1),
              "updatedAt",
              now,
            ),
          ),
        ),
      ),
  );

  await moveMediaDirectory(
    noteMediaPath(existing.meta.slug),
    chapterMediaPath(canonicalBookSlug, insertedPath),
  );
  await rewriteReferencesAcrossContent(
    new Map([[existing.meta.slug, chapterLocation(canonicalBookSlug, insertedPath)]]),
    [
      {
        oldPrefix: `/media/${noteMediaPath(existing.meta.slug)}`,
        newPrefix: `/media/${chapterMediaPath(canonicalBookSlug, insertedPath)}`,
      },
    ],
    new Set([existing.id]),
  );

  await rebuildIndexes();
  return parseChapterFile(
    path.join(destinationChaptersPath, `${chapterStem(requestedOrder, existing.meta.slug)}.md`),
    canonicalBookSlug,
    insertedPath,
  );
}

async function duplicateChapterTreeToPath(
  chapters: BookRecord["chapters"],
  destinationChaptersPath: string,
  destinationBookSlug: string,
  now: string,
) {
  for (const chapter of chapters) {
    const nextPath = path.join(
      destinationChaptersPath,
      `${chapterStem(chapter.meta.order, chapter.meta.slug)}.md`,
    );
    await fs.writeFile(
      nextPath,
      renderMatter(
        {
          ...chapter.meta,
          id: nextContentId(),
          bookSlug: destinationBookSlug,
          routeAliases: [],
          status: "draft",
          publishedAt: undefined,
          updatedAt: now,
          createdAt: now,
        } satisfies ChapterMeta,
        chapter.body,
      ),
      "utf8",
    );

    if (chapter.children.length > 0) {
      const childrenPath = chapterChildrenDirectory(
        destinationChaptersPath,
        chapter.meta.order,
        chapter.meta.slug,
      );
      await ensureDirectory(childrenPath);
      await duplicateChapterTreeToPath(
        chapter.children,
        childrenPath,
        destinationBookSlug,
        now,
      );
    }
  }
}

async function resetNestedChapterTreeToDraft(
  chaptersPath: string,
  bookSlug: string,
  now: string,
) {
  const chapterEntries = await listOrderedChapterFilesAtPath(chaptersPath);
  for (const chapter of chapterEntries) {
    const raw = await fs.readFile(chapter.filePath, "utf8");
    const parsed = matter(raw);
    const meta = chapterMetaSchema.parse({
      ...parsed.data,
      bookSlug,
      slug: chapter.slug,
      order: chapter.order,
    });

    await writeFileAtomic(
      chapter.filePath,
      renderMatter(
        {
          ...meta,
          id: nextContentId(),
          routeAliases: [],
          status: "draft",
          publishedAt: undefined,
          updatedAt: now,
          createdAt: now,
        } satisfies ChapterMeta,
        parsed.content.trim(),
      ),
    );

    await resetNestedChapterTreeToDraft(
      chapterChildrenDirectory(chaptersPath, chapter.order, chapter.slug),
      bookSlug,
      now,
    );
  }
}

export async function duplicateBook(bookSlug: string) {
  const existing = await getBook(bookSlug);
  const allBooks = await listOrderedBookFiles();
  const nextSlug = nextCopySlug(
    existing.meta.slug,
    new Set(allBooks.map((book) => book.slug)),
  );
  const now = new Date().toISOString();
  const nextOrder =
    allBooks.reduce(
      (highestOrder, book) => Math.max(highestOrder, book.order ?? 0),
      0,
    ) + 1;
  const directoryPath = bookDirectory(nextSlug);

  await ensureDirectory(path.join(directoryPath, "chapters"));
  await fs.writeFile(
    bookFilePath(nextSlug),
    renderMatter(
      {
        ...existing.meta,
        id: nextContentId(),
        title: nextCopyTitle(existing.meta.title),
        slug: nextSlug,
        routeAliases: [],
        order: nextOrder,
        status: "draft",
        featured: false,
        featuredAt: undefined,
        coverColor: existing.meta.coverColor ?? "#292118",
        publishedAt: undefined,
        updatedAt: now,
        createdAt: now,
        typography: normalizeBookTypography(existing.meta.typography, defaultBookTypography),
      } satisfies BookMeta,
      existing.body,
    ),
    "utf8",
  );

  await duplicateChapterTreeToPath(
    existing.chapters,
    path.join(directoryPath, "chapters"),
    nextSlug,
    now,
  );

  await rebuildIndexes();
  return getBook(nextSlug);
}

export async function duplicateChapter(bookSlug: string, chapterPathInput: string | string[]) {
  ensureSafeSlugOrThrow(bookSlug);
  const chapterPath = normalizeChapterPathInput(chapterPathInput);
  const locationResolution = await resolveChapterEntryLocation(bookSlug, chapterPath);
  if (!locationResolution.ok) {
    if (locationResolution.reason === "ambiguous") {
      throw new Error("Chapter path is ambiguous");
    }
    throw new Error("Chapter not found");
  }
  const { location } = locationResolution;
  const canonicalBookSlug = locationResolution.canonicalBookSlug;
  const chapterEntries = await listOrderedChapterFilesAtPath(location.chaptersPath);
  const existingEntry =
    chapterEntries.find((chapter) => chapter.filePath === location.entry.filePath) ?? null;
  if (!existingEntry) {
    throw new Error("Chapter not found");
  }

  const existing = await parseChapterFile(
    existingEntry.filePath,
    canonicalBookSlug,
    location.chapterPath,
  );

  const nextSlug = nextCopySlug(
    existingEntry.slug,
    new Set(chapterEntries.map((chapter) => chapter.slug)),
  );
  const now = new Date().toISOString();
  const nextOrder =
    chapterEntries.reduce(
      (highestOrder, chapter) => Math.max(highestOrder, chapter.order),
      0,
    ) + 1;
  const bookFontPreset =
    (readFrontMatterScalar(await fs.readFile(bookFilePath(canonicalBookSlug), "utf8"), "fontPreset") as
      | ChapterMeta["fontPreset"]
      | null) ??
    "source-serif";

  const nextPath = path.join(location.chaptersPath, `${chapterStem(nextOrder, nextSlug)}.md`);
  await fs.writeFile(
    nextPath,
    renderMatter(
      {
        ...existing.meta,
        id: nextContentId(),
        title: nextCopyTitle(existing.meta.title),
        slug: nextSlug,
        routeAliases: [],
        order: nextOrder,
        status: "draft",
        fontPreset: existing.meta.fontPreset ?? bookFontPreset,
        publishedAt: undefined,
        updatedAt: now,
        createdAt: now,
      } satisfies ChapterMeta,
      existing.body,
    ),
    "utf8",
  );
  await copyChapterSubtree(
    location.chaptersPath,
    existingEntry,
    location.chaptersPath,
    nextOrder,
    nextSlug,
  );
  await resetNestedChapterTreeToDraft(
    chapterChildrenDirectory(location.chaptersPath, nextOrder, nextSlug),
    canonicalBookSlug,
    now,
  );

  await rebuildIndexes();
  return parseChapterFile(
    nextPath,
    canonicalBookSlug,
    [...location.chapterPath.slice(0, -1), nextSlug],
  );
}

export async function duplicateNote(slug: string) {
  const existing = await getNote(slug);
  if (!existing) {
    throw new Error("Note not found");
  }

  const allNotes = await listOrderedNoteFiles();
  const nextSlug = nextCopySlug(
    existing.meta.slug,
    new Set(allNotes.map((note) => note.slug)),
  );
  const now = new Date().toISOString();
  const nextOrder =
    allNotes.reduce(
      (highestOrder, note) => Math.max(highestOrder, note.order ?? 0),
      0,
    ) + 1;

  await fs.writeFile(
    noteFilePath(nextSlug),
    renderMatter(
      {
        ...existing.meta,
        id: nextContentId(),
        title: nextCopyTitle(existing.meta.title),
        slug: nextSlug,
        routeAliases: [],
        order: nextOrder,
        status: "draft",
        publishedAt: undefined,
        updatedAt: now,
        createdAt: now,
        typography: normalizeBookTypography(existing.meta.typography, defaultNoteTypography),
      } satisfies NoteMeta,
      existing.body,
    ),
    "utf8",
  );

  await rebuildIndexes();
  return getNote(nextSlug);
}

export async function deleteBook(bookSlug: string) {
  ensureSafeSlugOrThrow(bookSlug);
  const existing = await getBook(bookSlug);
  if (!existing) {
    throw new Error("Book not found");
  }
  const canonicalBookSlug = existing.meta.slug;
  const books = await listOrderedBookFiles();
  const targetBook = books.find((book) => book.slug === canonicalBookSlug);
  if (!targetBook) {
    throw new Error("Book not found");
  }

  const bookRaw = await fs.readFile(targetBook.filePath, "utf8");
  await createRevision(contentIdFromRaw("book", bookRaw, canonicalBookSlug), bookRaw);
  for (const chapter of await listChapterEntryLocations(canonicalBookSlug)) {
    const chapterRaw = await fs.readFile(chapter.entry.filePath, "utf8");
    await createRevision(
      contentIdFromRaw(
        "chapter",
        chapterRaw,
        chapterLocation(canonicalBookSlug, chapter.chapterPath),
      ),
      chapterRaw,
    );
  }
  await fs.rm(bookDirectory(canonicalBookSlug), { recursive: true, force: true });
  const now = new Date().toISOString();
  await Promise.all(
    books
      .filter((entry) => entry.slug !== canonicalBookSlug)
      .map((entry, index) =>
        fs.readFile(entry.filePath, "utf8").then((raw) =>
          writeFileAtomic(
            entry.filePath,
            rewriteFrontMatterScalar(
              rewriteFrontMatterScalar(raw, "order", index + 1),
              "updatedAt",
              now,
            ),
          ),
        ),
      ),
  );
  await rebuildIndexes();
}

export async function deleteChapter(bookSlug: string, chapterPathInput: string | string[]) {
  ensureSafeSlugOrThrow(bookSlug);
  const chapterPath = normalizeChapterPathInput(chapterPathInput);
  const locationResolution = await resolveChapterEntryLocation(bookSlug, chapterPath);
  if (!locationResolution.ok) {
    if (locationResolution.reason === "ambiguous") {
      throw new Error("Chapter path is ambiguous");
    }
    throw new Error("Chapter not found");
  }
  const { location } = locationResolution;
  const canonicalBookSlug = locationResolution.canonicalBookSlug;

  const currentChaptersPath = location.chaptersPath;
  const chapterEntries = await listOrderedChapterFilesAtPath(currentChaptersPath);
  const existing =
    chapterEntries.find((chapter) => chapter.filePath === location.entry.filePath) ?? null;
  if (!existing?.filePath) {
    throw new Error("Chapter not found");
  }

  const remainingChapters = chapterEntries.filter((chapter) => chapter.filePath !== existing.filePath);
  const parentDirectory = path.dirname(currentChaptersPath);
  const stagingPath = path.join(parentDirectory, `.chapters-delete-${Date.now()}`);
  const backupPath = path.join(parentDirectory, `.chapters-backup-${Date.now()}`);
  const now = new Date().toISOString();

  const existingRaw = await fs.readFile(existing.filePath, "utf8");
  await createRevision(
    contentIdFromRaw(
      "chapter",
      existingRaw,
      chapterLocation(canonicalBookSlug, location.chapterPath),
    ),
    existingRaw,
  );
  await ensureDirectory(stagingPath);

  for (const [index, chapter] of remainingChapters.entries()) {
    const nextPath = path.join(
      stagingPath,
      `${chapterStem(index + 1, chapter.slug)}.md`,
    );
    const raw = await fs.readFile(chapter.filePath, "utf8");
    const nextRaw = rewriteFrontMatterScalar(
      rewriteFrontMatterScalar(raw, "order", index + 1),
      "updatedAt",
      now,
    );
    await fs.writeFile(
      nextPath,
      nextRaw,
      "utf8",
    );
    await copyChapterSubtree(
      currentChaptersPath,
      chapter,
      stagingPath,
      index + 1,
      chapter.slug,
    );
  }

  await fs.rename(currentChaptersPath, backupPath);

  try {
    await fs.rename(stagingPath, currentChaptersPath);
  } catch (error) {
    await fs.rename(backupPath, currentChaptersPath);
    await fs.rm(stagingPath, { recursive: true, force: true });
    throw error;
  }

  await fs.rm(backupPath, { recursive: true, force: true });
  await rebuildIndexes();
}

export async function deleteNote(slug: string) {
  ensureSafeSlugOrThrow(slug);
  const existing = await getNote(slug);
  if (!existing) {
    throw new Error("Note not found");
  }
  const canonicalSlug = existing.meta.slug;
  const notes = await listOrderedNoteFiles();
  const note = notes.find((entry) => entry.slug === canonicalSlug);
  if (!note) {
    throw new Error("Note not found");
  }

  const noteRaw = await fs.readFile(note.filePath, "utf8");
  await createRevision(contentIdFromRaw("note", noteRaw, canonicalSlug), noteRaw);
  await fs.rm(note.filePath, { force: true });
  const now = new Date().toISOString();
  await Promise.all(
    notes
      .filter((entry) => entry.slug !== canonicalSlug)
      .map((entry, index) =>
        fs.readFile(entry.filePath, "utf8").then((raw) =>
          writeFileAtomic(
            entry.filePath,
            rewriteFrontMatterScalar(
              rewriteFrontMatterScalar(raw, "order", index + 1),
              "updatedAt",
              now,
            ),
          ),
        ),
      ),
  );
  await rebuildIndexes();
}

export async function publishContentById(id: string, published: boolean) {
  const target = await getContentById(id);
  if (!target) {
    throw new Error("Content not found");
  }
  if (target.kind === "note") {
    const note = target;
    return updateNote(note.meta.slug, {
      title: note.meta.title,
      slug: note.meta.slug,
      summary: note.meta.summary,
      body: note.body,
      status: published ? "published" : "draft",
      allowExecution: note.meta.allowExecution,
      fontPreset: note.meta.fontPreset ?? "source-serif",
      typography: normalizeBookTypography(note.meta.typography, defaultNoteTypography),
      createRevision: true,
    });
  }
  if (target.kind === "book") {
    const book = target;
    return updateBook(book.meta.slug, {
      title: book.meta.title,
      slug: book.meta.slug,
      description: book.meta.description,
      body: book.body,
      status: published ? "published" : "draft",
      featured: book.meta.featured ?? false,
      coverColor: book.meta.coverColor ?? "#292118",
      fontPreset: book.meta.fontPreset ?? "source-serif",
      typography: normalizeBookTypography(book.meta.typography),
      createRevision: true,
    });
  }
  if (target.kind === "chapter") {
    const chapter = target;
    return updateChapterContent(chapter.meta.bookSlug, chapter.path, {
      title: chapter.meta.title,
      slug: chapter.meta.slug,
      summary: chapter.meta.summary,
      body: chapter.body,
      status: published ? "published" : "draft",
      allowExecution: chapter.meta.allowExecution,
      fontPreset: chapter.meta.fontPreset ?? "source-serif",
      createRevision: true,
    });
  }
  throw new Error("Unsupported content id");
}

export async function getContentById(id: string) {
  const records = await listAllContentRecords();
  const exact = records.find((record) => record.id === id) ?? null;
  if (exact) {
    return exact;
  }

  const [kind, location] = id.split(":");
  if (!location) {
    return null;
  }
  if (kind === "note") {
    return getNote(location);
  }
  if (kind === "book") {
    return getBook(location).catch(() => null);
  }
  if (kind === "chapter") {
    const { bookSlug, chapterPath } = chapterPathFromLocation(location);
    return getChapter(bookSlug, chapterPath);
  }
  return null;
}

export async function restoreRevision(input: unknown) {
  const data = restoreRevisionSchema.parse(input);
  const target = await getContentById(data.id);
  if (!target) {
    throw new Error("Content not found");
  }
  const availableRevisions = await listRevisions(target.id);
  if (!availableRevisions.includes(data.revisionFile)) {
    throw new Error("Revision not found");
  }
  const revisionDirectory = path.join(revisionsRoot, target.id.replace(/[/:]/g, "_"));
  const revisionPath = path.join(revisionDirectory, data.revisionFile);
  const raw = await fs.readFile(revisionPath, "utf8");
  await createRevision(target.id, target.raw);
  await writeFileAtomic(target.filePath, raw);
  await rebuildIndexes();
  return getContentById(target.id);
}

export async function loadRenderableContent(id: string) {
  const content = await getContentById(id);
  if (!content) {
    return null;
  }
  return {
    content,
    backlinks: await getBacklinks(content.id),
    revisions: await listRevisions(content.id),
    unresolvedLinks: await unresolvedWikiLinks(content.body),
  };
}

export async function listMediaForPage(pageId: string): Promise<MediaAsset[]> {
  const content = await getContentById(pageId);
  if (!content) {
    return [];
  }

  const seen = new Set<string>();
  const urls = extractMediaUrlsFromBody(content.body).filter((url) => {
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });

  const assets = await Promise.all(
    urls.map(async (url) => {
      const references = await findMediaReferences(url);
      let relativePath: string | null = null;
      let folder: string | null = null;
      let size: number | null = null;
      let modifiedAt: string | null = null;
      let missing = true;
      let name = path.posix.basename(url);

      try {
        const normalizedRelativePath = mediaUrlToRelativePath(url);
        const resolvedPath = path.resolve(uploadsRoot, ...normalizedRelativePath.split("/"));
        if (!resolvedPath.startsWith(path.resolve(uploadsRoot))) {
          throw new Error("Invalid media asset path");
        }

        const stats = await fs.stat(resolvedPath);
        relativePath = normalizedRelativePath;
        folder = path.posix.dirname(normalizedRelativePath);
        size = stats.size;
        modifiedAt = stats.mtime.toISOString();
        missing = false;
        name = path.basename(resolvedPath);
      } catch {
        // Keep unresolved media links visible for cleanup in the editor media tab.
      }

      return {
        name,
        url,
        relativePath,
        folder,
        size,
        modifiedAt,
        missing,
        references,
      } satisfies MediaAsset;
    }),
  );

  return assets;
}

export async function renameMediaAsset(
  url: string,
  newBaseName: string,
  rewriteReferences = true,
) {
  const parsedUrl = splitMediaUrl(url);
  if (!parsedUrl) {
    throw mediaError("Invalid media URL", 400);
  }

  const normalizedBaseName = normalizeMediaBaseName(newBaseName);
  if (!normalizedBaseName) {
    throw mediaError("Invalid media name", 400);
  }

  const oldRelativePath = mediaUrlToRelativePath(parsedUrl.canonical);
  const oldResolvedPath = path.resolve(uploadsRoot, ...oldRelativePath.split("/"));
  if (!oldResolvedPath.startsWith(path.resolve(uploadsRoot))) {
    throw mediaError("Invalid media asset path", 400);
  }

  try {
    await fs.access(oldResolvedPath);
  } catch {
    throw mediaError("Media file not found", 404);
  }

  const extension = path.extname(oldRelativePath);
  const nextFileName = `${normalizedBaseName}${extension}`;
  const parentFolder = path.posix.dirname(oldRelativePath);
  const nextRelativePath =
    parentFolder === "." ? nextFileName : `${parentFolder}/${nextFileName}`;
  const newCanonicalUrl = mediaRelativePathToUrl(nextRelativePath);

  if (newCanonicalUrl === parsedUrl.canonical) {
    return {
      ok: true as const,
      oldUrl: parsedUrl.canonical,
      newUrl: newCanonicalUrl,
      updatedReferences: 0,
    };
  }

  const newResolvedPath = path.resolve(uploadsRoot, ...nextRelativePath.split("/"));
  if (!newResolvedPath.startsWith(path.resolve(uploadsRoot))) {
    throw mediaError("Invalid media asset path", 400);
  }

  try {
    await fs.access(newResolvedPath);
    throw mediaError("A media file with that name already exists", 409);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await fs.rename(oldResolvedPath, newResolvedPath);

  let updatedReferences = 0;
  if (rewriteReferences) {
    const records = await listAllContentRecords();
    const recordsToRewrite = records
      .map((record) => {
        const rewritten = rewriteMediaUrlsInBody(
          record.body,
          parsedUrl.canonical,
          newCanonicalUrl,
        );
        return {
          record,
          rewritten,
        };
      })
      .filter(({ rewritten }) => rewritten.replacements > 0);

    for (const { record, rewritten } of recordsToRewrite) {
      await createRevision(record.id, record.raw);
      await writeFileAtomic(record.filePath, renderMatter(record.meta, rewritten.nextBody));
      updatedReferences += rewritten.replacements;
    }

    if (recordsToRewrite.length > 0) {
      await rebuildIndexes();
    }
  }

  return {
    ok: true as const,
    oldUrl: parsedUrl.canonical,
    newUrl: newCanonicalUrl,
    updatedReferences,
  };
}

export async function removeMediaAsset(url: string, force = false) {
  const relativePath = mediaUrlToRelativePath(url);
  const resolvedPath = path.resolve(uploadsRoot, ...relativePath.split("/"));

  if (!resolvedPath.startsWith(path.resolve(uploadsRoot))) {
    throw new Error("Invalid media asset path");
  }

  const references = await findMediaReferences(url);
  if (references.length > 0 && !force) {
    return {
      ok: false as const,
      blocked: true,
      references,
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destinationPath = path.join(trashUploadsRoot, timestamp, ...relativePath.split("/"));
  await ensureDirectory(path.dirname(destinationPath));
  await fs.rename(resolvedPath, destinationPath);

  return {
    ok: true as const,
    blocked: false,
    references,
  };
}
