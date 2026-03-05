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
  type ContentSearchResult,
  noteMetaSchema,
  moveChapterSchema,
  reorderBooksSchema,
  reorderChaptersSchema,
  reorderNotesSchema,
  restoreRevisionSchema,
  saveBookSchema,
  saveChapterSchema,
  saveGeneralSettingsSchema,
  saveNoteSchema,
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
  defaultUploadTargetPath,
  mediaRelativePathToUrl,
  mediaUrlToRelativePath,
  normalizeMediaTargetPath,
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

function noteId(slug: string) {
  return `note:${slug}`;
}

function bookId(slug: string) {
  return `book:${slug}`;
}

function chapterIdFromPath(bookSlug: string, chapterPath: string[]) {
  return `chapter:${bookSlug}/${chapterPath.join("/")}`;
}

function chapterPathFromLocation(location: string) {
  const [bookSlug, ...chapterPath] = location.split("/").filter(Boolean);
  return {
    bookSlug: bookSlug ?? "",
    chapterPath,
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

function readFrontMatterOrder(raw: string) {
  const value = readFrontMatterScalar(raw, "order");
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rewriteFrontMatterScalar(raw: string, key: string, value: string | number) {
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
  | { ok: true; location: ChapterEntryLocation }
  | { ok: false; reason: "not-found" | "ambiguous" }
> {
  const requestedPath = normalizeChapterPathInput(chapterPathInput);
  if (!requestedPath.length) {
    return { ok: false, reason: "not-found" };
  }

  const locations = await listChapterEntryLocations(bookSlug);
  const exact = locations.find(
    (location) =>
      location.chapterPath.length === requestedPath.length &&
      location.chapterPath.every((segment, index) => segment === requestedPath[index]),
  );
  if (exact) {
    return { ok: true, location: exact };
  }

  if (requestedPath.length === 1) {
    const leafMatches = locations.filter(
      (location) => location.chapterPath[location.chapterPath.length - 1] === requestedPath[0],
    );
    if (leafMatches.length === 1) {
      return { ok: true, location: leafMatches[0] };
    }
    if (leafMatches.length > 1) {
      return { ok: false, reason: "ambiguous" };
    }
  }

  return { ok: false, reason: "not-found" };
}

async function resolveParentChaptersPath(bookSlug: string, parentPath: string[]) {
  if (!parentPath.length) {
    return path.join(bookDirectory(bookSlug), "chapters");
  }

  const parentResolution = await resolveChapterEntryLocation(bookSlug, parentPath);
  if (!parentResolution.ok) {
    if (parentResolution.reason === "ambiguous") {
      throw new Error("Parent chapter path is ambiguous");
    }
    throw new Error("Parent chapter not found");
  }

  const { chaptersPath, entry } = parentResolution.location;
  return chapterChildrenDirectory(chaptersPath, entry.order, entry.slug);
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

async function parseBookFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const meta = bookMetaSchema.parse(parsed.data);
    const chaptersDir = path.join(path.dirname(filePath), "chapters");
    const chapters = await parseChapterDirectory(chaptersDir, meta.slug, []);

    return {
      id: bookId(meta.slug),
      kind: "book" as const,
      filePath,
      meta,
      body: parsed.content.trim(),
      raw,
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
    const children = await parseChapterDirectory(
      chapterChildrenDirectoryByFile(filePath),
      bookSlug,
      chapterPath,
    );

    return {
      id: chapterIdFromPath(meta.bookSlug, chapterPath),
      kind: "chapter" as const,
      filePath,
      meta,
      path: chapterPath,
      body: parsed.content.trim(),
      raw,
      route: chapterRoute(meta.bookSlug, chapterPath),
      children,
    };
  } catch (error) {
    throw wrapContentFileError(filePath, error);
  }
}

async function parseNoteFile(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const meta = noteMetaSchema.parse(parsed.data);
    return {
      id: noteId(meta.slug),
      kind: "note" as const,
      filePath,
      meta,
      body: parsed.content.trim(),
      raw,
      route: `/notes/${meta.slug}`,
    };
  } catch (error) {
    throw wrapContentFileError(filePath, error);
  }
}

async function listBookRecords() {
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

async function listNoteRecords() {
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

function getChapterSiblingsByParentPath(
  chapters: BookRecord["chapters"],
  parentPath: string[],
): BookRecord["chapters"] | null {
  if (!parentPath.length) {
    return chapters;
  }

  const parent = findChapterByPath(chapters, parentPath);
  if (!parent) {
    return null;
  }

  return parent.children;
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

function renumberChapterSiblings(
  chapters: BookRecord["chapters"],
  now: string,
  options?: { touchUpdatedAt?: boolean },
) {
  const touchUpdatedAt = options?.touchUpdatedAt ?? true;
  for (const [index, chapter] of chapters.entries()) {
    const nextOrder = index + 1;
    chapter.meta.order = nextOrder;
    if (touchUpdatedAt) {
      chapter.meta.updatedAt = now;
    }
  }
}

async function writeChapterTreeToDirectory(
  chaptersPath: string,
  chapters: BookRecord["chapters"],
  bookSlug: string,
) {
  for (const chapter of chapters) {
    const stem = chapterStem(chapter.meta.order, chapter.meta.slug);
    const filePath = path.join(chaptersPath, `${stem}.md`);
    await fs.writeFile(
      filePath,
      renderMatter(
        {
          ...chapter.meta,
          kind: "chapter",
          bookSlug,
          slug: chapter.meta.slug,
          order: chapter.meta.order,
        } satisfies ChapterMeta,
        chapter.body,
      ),
      "utf8",
    );

    if (chapter.children.length) {
      const childrenPath = path.join(chaptersPath, stem, "chapters");
      await ensureDirectory(childrenPath);
      await writeChapterTreeToDirectory(childrenPath, chapter.children, bookSlug);
    }
  }
}

async function replaceBookChaptersDirectory(
  bookSlug: string,
  chapters: BookRecord["chapters"],
) {
  const chaptersPath = path.join(bookDirectory(bookSlug), "chapters");
  const bookRoot = bookDirectory(bookSlug);
  const stagingPath = path.join(bookRoot, `.chapters-write-${Date.now()}`);
  const backupPath = path.join(bookRoot, `.chapters-backup-${Date.now()}`);

  await ensureDirectory(stagingPath);
  await writeChapterTreeToDirectory(stagingPath, chapters, bookSlug);
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

async function listFilesRecursively(directoryPath: string): Promise<string[]> {
  const entries = await readDirectoryEntries(directoryPath);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const nextPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(nextPath);
      }

      if (entry.isFile()) {
        return [nextPath];
      }

      return [];
    }),
  );

  return nested.flat();
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
        kind: "book",
        title: "WebBook Handbook",
        slug: sampleBookSlug,
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
        kind: "chapter",
        bookSlug: sampleBookSlug,
        title: "Computational Chapter",
        slug: "computational-chapter",
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
        kind: "note",
        title: "WebBook Notes",
        slug: "webbook-notes",
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
  ensureSafeSlugOrThrow(bookSlug);
  await ensureContentScaffold();
  return parseBookFile(bookFilePath(bookSlug));
}

export async function getChapter(bookSlug: string, chapterPathInput: string | string[]) {
  ensureSafeSlugOrThrow(bookSlug);
  const requestedPath = normalizeChapterPathInput(chapterPathInput);
  if (!requestedPath.length) {
    return null;
  }
  const book = await getBook(bookSlug);
  const resolution = resolveChapterPath(book.chapters, requestedPath);
  if (!resolution.ok) {
    return null;
  }
  return findChapterByPath(book.chapters, resolution.chapterPath);
}

export async function getNote(slug: string) {
  ensureSafeSlugOrThrow(slug);
  await ensureContentScaffold();
  try {
    return await parseNoteFile(noteFilePath(slug));
  } catch {
    return null;
  }
}

export async function getPublicBook(bookSlug: string) {
  const book = await getBook(bookSlug);
  if (book.meta.status !== "published") {
    return null;
  }

  const filterPublished = (chapters: BookRecord["chapters"]): BookRecord["chapters"] =>
    chapters
      .filter((chapter) => chapter.meta.status === "published")
      .map((chapter) => ({
        ...chapter,
        children: filterPublished(chapter.children),
      }));

  return {
    ...book,
    chapters: filterPublished(book.chapters),
  };
}

export async function getPublicChapter(bookSlug: string, chapterPathInput: string | string[]) {
  const requestedPath = normalizeChapterPathInput(chapterPathInput);
  if (!requestedPath.length) {
    return null;
  }
  const book = await getPublicBook(bookSlug);
  if (!book) {
    return null;
  }
  const resolution = resolveChapterPath(book.chapters, requestedPath);
  if (!resolution.ok) {
    return null;
  }
  const chapter = findChapterByPath(book.chapters, resolution.chapterPath);
  if (!chapter || chapter.meta.status !== "published") {
    return null;
  }
  return { book, chapter };
}

export async function getPublicNote(slug: string) {
  const note = await getNote(slug);
  if (!note || note.meta.status !== "published") {
    return null;
  }
  return note;
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
  const directoryPath = path.join(revisionsRoot, id.replace(/[/:]/g, "_"));
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
      kind: "book",
      title: data.title,
      slug,
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
  const data = saveBookSchema.parse(input);
  const now = new Date().toISOString();
  const raw = renderMatter(
    {
      ...existing.meta,
      title: data.title,
      slug: existing.meta.slug,
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
    } satisfies BookMeta,
    data.body,
  );
  if (data.createRevision) {
    await createRevision(existing.id, existing.raw);
  }
  await writeFileAtomic(existing.filePath, raw);
  if (data.featured) {
    await enforceFeaturedBookLimit();
  }
  await rebuildIndexes();
  return getBook(existing.meta.slug);
}

export async function createChapter(bookSlug: string, input: unknown) {
  ensureSafeSlugOrThrow(bookSlug);
  await fs.access(bookFilePath(bookSlug));
  const data = saveChapterSchema.parse(input);
  const parentChapterPath = normalizeChapterPathInput(data.parentChapterPath);
  const chaptersPath = await resolveParentChaptersPath(bookSlug, parentChapterPath);
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
      kind: "chapter",
      bookSlug,
      title: data.title,
      slug,
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
  return parseChapterFile(filePath, bookSlug, [...parentChapterPath, slug]);
}

export async function updateChapter(
  bookSlug: string,
  chapterPathInput: string | string[],
  input: unknown,
) {
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
  const chapterEntries = await listOrderedChapterFilesAtPath(location.chaptersPath);
  const existingEntry =
    chapterEntries.find((chapter) => chapter.filePath === location.entry.filePath) ?? null;
  if (!existingEntry) {
    throw new Error("Chapter not found");
  }

  const existing = await parseChapterFile(existingEntry.filePath, bookSlug, location.chapterPath);
  const hasExplicitParentPath =
    typeof input === "object" &&
    input !== null &&
    Array.isArray((input as { parentChapterPath?: unknown }).parentChapterPath);
  const data = saveChapterSchema.parse(input);
  const currentParentPath = location.chapterPath.slice(0, -1);
  const requestedParentPath = hasExplicitParentPath
    ? normalizeChapterPathInput(data.parentChapterPath)
    : currentParentPath;
  if (
    requestedParentPath.length !== currentParentPath.length ||
    requestedParentPath.some((segment, index) => segment !== currentParentPath[index])
  ) {
    throw new Error("Reparenting chapters is not supported");
  }

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
  if (data.order > chapterEntries.length) {
    throw new Error(`Chapter order must be between 1 and ${chapterEntries.length}`);
  }
  const nextMeta = {
    ...existing.meta,
    title: data.title,
    slug: nextSlug,
    order: data.order,
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
  const requiresReorderOrRename =
    data.order !== existingEntry.order || nextSlug !== existingEntry.slug;

  if (requiresReorderOrRename) {
    const reorderedChapters = chapterEntries.filter(
      (chapter) => chapter.filePath !== existingEntry.filePath,
    );

    reorderedChapters.splice(data.order - 1, 0, {
      ...existingEntry,
      slug: nextSlug,
      order: data.order,
    });

    const parentDirectory = path.dirname(location.chaptersPath);
    const currentChaptersPath = location.chaptersPath;
    const stagingPath = path.join(parentDirectory, `.chapters-update-${Date.now()}`);
    const backupPath = path.join(parentDirectory, `.chapters-backup-${Date.now()}`);

    await ensureDirectory(stagingPath);

    for (const chapter of chapterEntries) {
      await createRevision(
        chapterIdFromPath(bookSlug, [...currentParentPath, chapter.slug]),
        await fs.readFile(chapter.filePath, "utf8"),
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
    await rebuildIndexes();
    const canonicalPath = [...currentParentPath, nextSlug];
    return parseChapterFile(
      path.join(currentChaptersPath, `${chapterStem(data.order, nextSlug)}.md`),
      bookSlug,
      canonicalPath,
    );
  }

  if (data.createRevision) {
    await createRevision(existing.id, existing.raw);
  }
  await writeFileAtomic(existing.filePath, raw);
  await rebuildIndexes();
  return parseChapterFile(existing.filePath, bookSlug, location.chapterPath);
}

export async function moveChapter(bookSlug: string, input: unknown) {
  ensureSafeSlugOrThrow(bookSlug);
  const data = moveChapterSchema.parse(input);
  const chapterPath = normalizeChapterPathInput(data.chapterPath);
  const destinationParentPath = normalizeChapterPathInput(data.parentChapterPath);
  if (!chapterPath.length) {
    throw new Error("Chapter path is required");
  }

  if (chapterPathStartsWith(destinationParentPath, chapterPath)) {
    throw new Error("Cannot move a chapter into itself or its descendants");
  }

  const sourceParentPath = chapterPath.slice(0, -1);
  const movingSlug = chapterPath[chapterPath.length - 1];
  if (!movingSlug) {
    throw new Error("Chapter not found");
  }

  const book = await getBook(bookSlug);
  const sourceSiblings = getChapterSiblingsByParentPath(book.chapters, sourceParentPath);
  if (!sourceSiblings) {
    throw new Error("Chapter not found");
  }

  const sourceIndex = sourceSiblings.findIndex((chapter) => chapter.meta.slug === movingSlug);
  if (sourceIndex < 0) {
    throw new Error("Chapter not found");
  }

  const destinationSiblingsBeforeMove = getChapterSiblingsByParentPath(
    book.chapters,
    destinationParentPath,
  );
  if (!destinationSiblingsBeforeMove) {
    throw new Error("Destination parent chapter not found");
  }

  const sameParent = chapterPathsEqual(sourceParentPath, destinationParentPath);
  if (sameParent && data.order === undefined) {
    const currentChapter = findChapterByPath(book.chapters, chapterPath);
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
    const currentChapter = findChapterByPath(book.chapters, chapterPath);
    if (!currentChapter) {
      throw new Error("Chapter not found");
    }
    return currentChapter;
  }

  const revisionCandidates = new Map<string, ChapterRecord>();
  for (const chapter of sourceSiblings) {
    revisionCandidates.set(chapter.path.join("/"), chapter);
  }
  for (const chapter of destinationSiblingsBeforeMove) {
    revisionCandidates.set(chapter.path.join("/"), chapter);
  }

  const [movedChapter] = sourceSiblings.splice(sourceIndex, 1);
  const destinationSiblingsAfterRemoval = getChapterSiblingsByParentPath(
    book.chapters,
    destinationParentPath,
  );
  if (!destinationSiblingsAfterRemoval) {
    throw new Error("Destination parent chapter not found");
  }

  if (
    destinationSiblingsAfterRemoval.some((chapter) => chapter.meta.slug === movedChapter.meta.slug)
  ) {
    throw new Error("A chapter with that slug already exists in the destination");
  }

  const insertionIndex = Math.min(requestedOrder - 1, destinationSiblingsAfterRemoval.length);
  destinationSiblingsAfterRemoval.splice(insertionIndex, 0, movedChapter);

  const now = new Date().toISOString();
  for (const chapter of revisionCandidates.values()) {
    await createRevision(chapter.id, chapter.raw);
  }

  renumberChapterSiblings(sourceSiblings, now);
  if (destinationSiblingsAfterRemoval !== sourceSiblings) {
    renumberChapterSiblings(destinationSiblingsAfterRemoval, now);
  }
  movedChapter.meta.updatedAt = now;

  await replaceBookChaptersDirectory(bookSlug, book.chapters);
  await rebuildIndexes();

  const movedPath = [...destinationParentPath, movedChapter.meta.slug];
  const moved = await getChapter(bookSlug, movedPath);
  if (!moved) {
    throw new Error("Chapter move failed");
  }
  return moved;
}

export async function reorderBookChapters(bookSlug: string, input: unknown) {
  ensureSafeSlugOrThrow(bookSlug);
  const data = reorderChaptersSchema.parse(input);
  const parentChapterPath = normalizeChapterPathInput(data.parentChapterPath);
  const currentChaptersPath = await resolveParentChaptersPath(bookSlug, parentChapterPath);
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
    await createRevision(
      chapterIdFromPath(bookSlug, [...parentChapterPath, chapter.slug]),
      await fs.readFile(chapter.filePath, "utf8"),
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
    return await getBook(bookSlug);
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
      kind: "note",
      title: data.title,
      slug,
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
  const raw = renderMatter(
    {
      ...existing.meta,
      title: data.title,
      slug: existing.meta.slug,
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
    } satisfies NoteMeta,
    data.body,
  );
  if (data.createRevision) {
    await createRevision(existing.id, existing.raw);
  }
  await writeFileAtomic(existing.filePath, raw);
  await rebuildIndexes();
  return getNote(existing.meta.slug);
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
          bookSlug: destinationBookSlug,
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
        title: nextCopyTitle(existing.meta.title),
        slug: nextSlug,
        order: nextOrder,
        status: "draft",
        featured: false,
        featuredAt: undefined,
        coverColor: existing.meta.coverColor ?? "#292118",
        publishedAt: undefined,
        updatedAt: now,
        createdAt: now,
        typography: normalizeBookTypography(existing.meta.typography, defaultNoteTypography),
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
  const chapterEntries = await listOrderedChapterFilesAtPath(location.chaptersPath);
  const existingEntry =
    chapterEntries.find((chapter) => chapter.filePath === location.entry.filePath) ?? null;
  if (!existingEntry) {
    throw new Error("Chapter not found");
  }

  const existing = await parseChapterFile(existingEntry.filePath, bookSlug, location.chapterPath);

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
    (readFrontMatterScalar(await fs.readFile(bookFilePath(bookSlug), "utf8"), "fontPreset") as
      | ChapterMeta["fontPreset"]
      | null) ??
    "source-serif";

  const nextPath = path.join(location.chaptersPath, `${chapterStem(nextOrder, nextSlug)}.md`);
  await fs.writeFile(
    nextPath,
    renderMatter(
      {
        ...existing.meta,
        title: nextCopyTitle(existing.meta.title),
        slug: nextSlug,
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
    bookSlug,
    now,
  );

  await rebuildIndexes();
  return parseChapterFile(
    nextPath,
    bookSlug,
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
        title: nextCopyTitle(existing.meta.title),
        slug: nextSlug,
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
  const books = await listOrderedBookFiles();
  const targetBook = books.find((book) => book.slug === bookSlug);
  if (!targetBook) {
    throw new Error("Book not found");
  }

  await createRevision(bookId(bookSlug), await fs.readFile(targetBook.filePath, "utf8"));
  for (const chapter of await listChapterEntryLocations(bookSlug)) {
    await createRevision(
      chapterIdFromPath(bookSlug, chapter.chapterPath),
      await fs.readFile(chapter.entry.filePath, "utf8"),
    );
  }
  await fs.rm(bookDirectory(bookSlug), { recursive: true, force: true });
  const now = new Date().toISOString();
  await Promise.all(
    books
      .filter((entry) => entry.slug !== bookSlug)
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

  await createRevision(
    chapterIdFromPath(bookSlug, location.chapterPath),
    await fs.readFile(existing.filePath, "utf8"),
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
  const notes = await listOrderedNoteFiles();
  const note = notes.find((entry) => entry.slug === slug);
  if (!note) {
    throw new Error("Note not found");
  }

  await createRevision(noteId(slug), await fs.readFile(note.filePath, "utf8"));
  await fs.rm(note.filePath, { force: true });
  const now = new Date().toISOString();
  await Promise.all(
    notes
      .filter((entry) => entry.slug !== slug)
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
  const [kind, location] = id.split(":");
  if (kind === "note") {
    const note = await getNote(location);
    if (!note) {
      throw new Error("Note not found");
    }
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
  if (kind === "book") {
    const book = await getBook(location);
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
  if (kind === "chapter") {
    const { bookSlug, chapterPath } = chapterPathFromLocation(location);
    const chapter = await getChapter(bookSlug, chapterPath);
    if (!chapter) {
      throw new Error("Chapter not found");
    }
    return updateChapter(bookSlug, chapter.path, {
      title: chapter.meta.title,
      slug: chapter.meta.slug,
      parentChapterPath: chapter.path.slice(0, -1),
      summary: chapter.meta.summary,
      body: chapter.body,
      status: published ? "published" : "draft",
      allowExecution: chapter.meta.allowExecution,
      fontPreset: chapter.meta.fontPreset ?? "source-serif",
      order: chapter.meta.order,
      createRevision: true,
    });
  }
  throw new Error("Unsupported content id");
}

export async function getContentById(id: string) {
  const [kind, location] = id.split(":");
  if (kind === "note") {
    return getNote(location);
  }
  if (kind === "book") {
    return getBook(location);
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
  const availableRevisions = await listRevisions(data.id);
  if (!availableRevisions.includes(data.revisionFile)) {
    throw new Error("Revision not found");
  }
  const revisionDirectory = path.join(revisionsRoot, data.id.replace(/[/:]/g, "_"));
  const revisionPath = path.join(revisionDirectory, data.revisionFile);
  const raw = await fs.readFile(revisionPath, "utf8");
  await createRevision(data.id, target.raw);
  await writeFileAtomic(target.filePath, raw);
  await rebuildIndexes();
  return getContentById(data.id);
}

export async function loadRenderableContent(id: string) {
  const content = await getContentById(id);
  if (!content) {
    return null;
  }
  return {
    content,
    backlinks: await getBacklinks(id),
    revisions: await listRevisions(id),
    unresolvedLinks: await unresolvedWikiLinks(content.body),
  };
}

export async function listMediaForPage(pageId: string): Promise<MediaAsset[]> {
  const relativeFolder = normalizeMediaTargetPath(defaultUploadTargetPath(pageId));
  const directoryPath = path.join(uploadsRoot, ...relativeFolder.split("/"));

  try {
    await fs.access(directoryPath);
  } catch {
    return [];
  }

  const files = await listFilesRecursively(directoryPath);
  const assets = await Promise.all(
    files.map(async (filePath) => {
      const relativePath = path.relative(uploadsRoot, filePath).split(path.sep).join("/");
      const url = mediaRelativePathToUrl(relativePath);
      const stats = await fs.stat(filePath);

      return {
        name: path.basename(filePath),
        url,
        relativePath,
        folder: relativeFolder,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        references: await findMediaReferences(url),
      } satisfies MediaAsset;
    }),
  );

  return assets.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
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
