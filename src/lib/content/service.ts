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

function chapterId(bookSlug: string, slug: string) {
  return `chapter:${bookSlug}/${slug}`;
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

function extractWikiTargets(markdown: string) {
  return Array.from(markdown.matchAll(/\[\[([^[\]]+)\]\]/g)).map((match) =>
    match[1].trim(),
  );
}

function buildAliases(entry: ManifestEntry) {
  const aliases = new Set<string>();
  aliases.add(entry.slug);
  if (entry.kind === "chapter" && entry.bookSlug) {
    aliases.add(`${entry.bookSlug}/${entry.slug}`);
  }
  return aliases;
}

async function parseBookFile(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const meta = bookMetaSchema.parse(parsed.data);
  const chaptersDir = path.join(path.dirname(filePath), "chapters");
  const chapterEntries = await readDirectoryEntries(chaptersDir);
  const chapters = (
    await Promise.all(
      chapterEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map(async (entry) =>
          parseChapterFile(path.join(chaptersDir, entry.name), meta.slug),
        ),
    )
  ).sort((left, right) => left.meta.order - right.meta.order);

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
}

async function parseChapterFile(filePath: string, bookSlug: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = matter(raw);
  const meta = chapterMetaSchema.parse({
    ...parsed.data,
    bookSlug,
  });
  return {
    id: chapterId(meta.bookSlug, meta.slug),
    kind: "chapter" as const,
    filePath,
    meta,
    body: parsed.content.trim(),
    raw,
    route: `/books/${meta.bookSlug}/${meta.slug}`,
  };
}

async function parseNoteFile(filePath: string) {
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
    ...books.flatMap((book) => book.chapters),
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
  const aliasLookup = new Map<string, ManifestEntry>();

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
    buildAliases(bookEntry).forEach((alias) => aliasLookup.set(alias, bookEntry));

    for (const chapter of book.chapters) {
      const chapterEntry: ManifestEntry = {
        id: chapter.id,
        kind: "chapter",
        slug: chapter.meta.slug,
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
        workspaceRoute: `/app/books/${chapter.meta.bookSlug}/chapters/${chapter.meta.slug}`,
      });
      buildAliases(chapterEntry).forEach((alias) =>
        aliasLookup.set(alias, chapterEntry),
      );
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
    buildAliases(noteEntry).forEach((alias) => aliasLookup.set(alias, noteEntry));
  }

  const allContent = [
    ...content.books.flatMap<ContentRecord>((book) => [book, ...book.chapters]),
    ...content.notes,
  ];

  for (const item of allContent) {
    for (const target of extractWikiTargets(item.body)) {
      const { pageTarget } = splitWikiTarget(target);
      const resolved = aliasLookup.get(pageTarget || target);
      if (!resolved) {
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

  return {
    books: books
      .filter((book) => !publicOnly || book.meta.status === "published")
      .map((book) => ({
        meta: book.meta,
        route: book.route,
        chapters: book.chapters
          .filter((chapter) => !publicOnly || chapter.meta.status === "published")
          .map((chapter) => ({
            meta: chapter.meta,
            route: chapter.route,
          })),
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

export async function getChapter(bookSlug: string, chapterSlug: string) {
  ensureSafeSlugOrThrow(bookSlug);
  ensureSafeSlugOrThrow(chapterSlug);
  const book = await getBook(bookSlug);
  return book.chapters.find((chapter) => chapter.meta.slug === chapterSlug) ?? null;
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
  return {
    ...book,
    chapters: book.chapters.filter((chapter) => chapter.meta.status === "published"),
  };
}

export async function getPublicChapter(bookSlug: string, chapterSlug: string) {
  const book = await getPublicBook(bookSlug);
  if (!book) {
    return null;
  }
  const chapter = book.chapters.find((item) => item.meta.slug === chapterSlug);
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
  const aliasLookup = new Map<string, ManifestEntry>();
  manifest.forEach((entry) => {
    buildAliases(entry).forEach((alias) => aliasLookup.set(alias, entry));
  });

  return extractWikiTargets(markdown).filter((target) => {
    const { pageTarget, headingTarget } = splitWikiTarget(target);
    const resolved = aliasLookup.get(pageTarget || target);
    if (!resolved) {
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
  const existingBooks = await listBookRecords();
  if (existingBooks.some((book) => book.meta.slug === slug)) {
    throw new Error("A book with that slug already exists");
  }

  const now = new Date().toISOString();
  const nextOrder =
    existingBooks.reduce(
      (highestOrder, book) => Math.max(highestOrder, book.meta.order ?? 0),
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
  const book = await getBook(bookSlug);
  const data = saveChapterSchema.parse(input);
  const slug = toSlug(data.slug);
  ensureSafeSlugOrThrow(slug);
  if (book.chapters.some((chapter) => chapter.meta.slug === slug)) {
    throw new Error("A chapter with that slug already exists in this book");
  }
  if (book.chapters.some((chapter) => chapter.meta.order === data.order)) {
    throw new Error(`A chapter already uses order ${data.order}`);
  }
  const now = new Date().toISOString();
  const raw = renderMatter(
    {
      kind: "chapter",
      bookSlug: book.meta.slug,
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
  await fs.writeFile(chapterFilePath(book.meta.slug, slug, data.order), raw, {
    encoding: "utf8",
    flag: "wx",
  });
  await rebuildIndexes();
  return getChapter(book.meta.slug, slug);
}

export async function updateChapter(
  bookSlug: string,
  chapterSlug: string,
  input: unknown,
) {
  const book = await getBook(bookSlug);
  const existing = book.chapters.find((chapter) => chapter.meta.slug === chapterSlug) ?? null;
  if (!existing) {
    throw new Error("Chapter not found");
  }
  const data = saveChapterSchema.parse(input);
  const now = new Date().toISOString();
  const nextSlug = toSlug(data.slug);
  ensureSafeSlugOrThrow(nextSlug);
  if (
    book.chapters.some(
      (chapter) =>
        chapter.meta.slug === nextSlug && chapter.meta.slug !== existing.meta.slug,
    )
  ) {
    throw new Error("A chapter with that slug already exists in this book");
  }
  if (
    book.chapters.some(
      (chapter) =>
        chapter.meta.order === data.order && chapter.meta.slug !== existing.meta.slug,
    )
  ) {
    throw new Error(`A chapter already uses order ${data.order}`);
  }
  const raw = renderMatter(
    {
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
    } satisfies ChapterMeta,
    data.body,
  );
  if (data.createRevision) {
    await createRevision(existing.id, existing.raw);
  }
  const nextPath = chapterFilePath(existing.meta.bookSlug, nextSlug, data.order);
  if (existing.filePath === nextPath) {
    await writeFileAtomic(nextPath, raw);
  } else {
    const backupPath = `${existing.filePath}.rename-${process.pid}-${Date.now()}`;
    await fs.rename(existing.filePath, backupPath);
    try {
      await writeFileAtomic(nextPath, raw);
      await fs.rm(backupPath, { force: true });
    } catch (error) {
      await fs.rename(backupPath, existing.filePath).catch(() => undefined);
      throw error;
    }
  }
  await rebuildIndexes();
  return getChapter(existing.meta.bookSlug, nextSlug);
}

export async function reorderBookChapters(bookSlug: string, input: unknown) {
  ensureSafeSlugOrThrow(bookSlug);
  const data = reorderChaptersSchema.parse(input);
  const book = await getBook(bookSlug);
  const chapterMap = new Map(
    book.chapters.map((chapter) => [chapter.meta.slug, chapter] as const),
  );
  const uniqueSlugs = new Set(data.chapterSlugs);

  if (
    data.chapterSlugs.length !== book.chapters.length ||
    uniqueSlugs.size !== book.chapters.length
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
  const bookPath = bookDirectory(bookSlug);
  const currentChaptersPath = path.join(bookPath, "chapters");
  const stagingPath = path.join(bookPath, `.chapters-reorder-${Date.now()}`);
  const backupPath = path.join(bookPath, `.chapters-backup-${Date.now()}`);

  await ensureDirectory(stagingPath);

  for (const chapter of book.chapters) {
    await createRevision(chapter.id, chapter.raw);
  }

  for (const [index, slug] of data.chapterSlugs.entries()) {
    const chapter = chapterMap.get(slug);
    if (!chapter) {
      throw new Error(`Unknown chapter slug: ${slug}`);
    }

    const nextOrder = index + 1;
    const raw = renderMatter(
      {
        ...chapter.meta,
        order: nextOrder,
        updatedAt: now,
      } satisfies ChapterMeta,
      chapter.body,
    );

    await fs.writeFile(
      path.join(stagingPath, `${String(nextOrder).padStart(3, "0")}-${slug}.md`),
      raw,
      "utf8",
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
  return getBook(bookSlug);
}

export async function reorderBooks(input: unknown) {
  const data = reorderBooksSchema.parse(input);
  const books = await listBookRecords();
  const bookMap = new Map(books.map((book) => [book.meta.slug, book] as const));
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

      await fs.writeFile(
        book.filePath,
        renderMatter(
          {
            ...book.meta,
            order: index + 1,
            updatedAt: now,
          } satisfies BookMeta,
          book.body,
        ),
        "utf8",
      );
    }),
  );

  await rebuildIndexes();
  return getContentTree();
}

export async function reorderNotes(input: unknown) {
  const data = reorderNotesSchema.parse(input);
  const notes = await listNoteRecords();
  const noteMap = new Map(notes.map((note) => [note.meta.slug, note] as const));
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

      await fs.writeFile(
        note.filePath,
        renderMatter(
          {
            ...note.meta,
            order: index + 1,
            updatedAt: now,
          } satisfies NoteMeta,
          note.body,
        ),
        "utf8",
      );
    }),
  );

  await rebuildIndexes();
  return getContentTree();
}

export async function createNote(input: unknown) {
  const data = saveNoteSchema.parse(input);
  const slug = toSlug(data.slug);
  ensureSafeSlugOrThrow(slug);
  const existingNotes = await listNoteRecords();
  if (existingNotes.some((note) => note.meta.slug === slug)) {
    throw new Error("A note with that slug already exists");
  }

  const now = new Date().toISOString();
  const nextOrder =
    existingNotes.reduce(
      (highestOrder, note) => Math.max(highestOrder, note.meta.order ?? 0),
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

export async function duplicateBook(bookSlug: string) {
  const existing = await getBook(bookSlug);
  const allBooks = await listBookRecords();
  const nextSlug = nextCopySlug(
    existing.meta.slug,
    new Set(allBooks.map((book) => book.meta.slug)),
  );
  const now = new Date().toISOString();
  const nextOrder =
    allBooks.reduce(
      (highestOrder, book) => Math.max(highestOrder, book.meta.order ?? 0),
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

  for (const chapter of existing.chapters) {
    await fs.writeFile(
      chapterFilePath(nextSlug, chapter.meta.slug, chapter.meta.order),
      renderMatter(
        {
          ...chapter.meta,
          bookSlug: nextSlug,
          status: "draft",
          publishedAt: undefined,
          updatedAt: now,
          createdAt: now,
        } satisfies ChapterMeta,
        chapter.body,
      ),
      "utf8",
    );
  }

  await rebuildIndexes();
  return getBook(nextSlug);
}

export async function duplicateChapter(bookSlug: string, chapterSlug: string) {
  const book = await getBook(bookSlug);
  const existing = book.chapters.find((chapter) => chapter.meta.slug === chapterSlug);
  if (!existing) {
    throw new Error("Chapter not found");
  }

  const nextSlug = nextCopySlug(
    existing.meta.slug,
    new Set(book.chapters.map((chapter) => chapter.meta.slug)),
  );
  const now = new Date().toISOString();
  const nextOrder =
    book.chapters.reduce(
      (highestOrder, chapter) => Math.max(highestOrder, chapter.meta.order),
      0,
    ) + 1;

  await fs.writeFile(
    chapterFilePath(bookSlug, nextSlug, nextOrder),
    renderMatter(
      {
        ...existing.meta,
        title: nextCopyTitle(existing.meta.title),
        slug: nextSlug,
        order: nextOrder,
        status: "draft",
        fontPreset: existing.meta.fontPreset ?? book.meta.fontPreset ?? "source-serif",
        publishedAt: undefined,
        updatedAt: now,
        createdAt: now,
      } satisfies ChapterMeta,
      existing.body,
    ),
    "utf8",
  );

  await rebuildIndexes();
  return getChapter(bookSlug, nextSlug);
}

export async function duplicateNote(slug: string) {
  const existing = await getNote(slug);
  if (!existing) {
    throw new Error("Note not found");
  }

  const allNotes = await listNoteRecords();
  const nextSlug = nextCopySlug(
    existing.meta.slug,
    new Set(allNotes.map((note) => note.meta.slug)),
  );
  const now = new Date().toISOString();
  const nextOrder =
    allNotes.reduce(
      (highestOrder, note) => Math.max(highestOrder, note.meta.order ?? 0),
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
  const book = await getBook(bookSlug);
  const books = await listBookRecords();
  await createRevision(book.id, book.raw);
  for (const chapter of book.chapters) {
    await createRevision(chapter.id, chapter.raw);
  }
  await fs.rm(bookDirectory(bookSlug), { recursive: true, force: true });
  const now = new Date().toISOString();
  await Promise.all(
    books
      .filter((entry) => entry.meta.slug !== bookSlug)
      .sort(
        (left, right) =>
          contentOrder(left.meta.order) - contentOrder(right.meta.order),
      )
      .map((entry, index) =>
        fs.writeFile(
          entry.filePath,
          renderMatter(
            {
              ...entry.meta,
              order: index + 1,
              updatedAt: now,
            } satisfies BookMeta,
            entry.body,
          ),
          "utf8",
        ),
      ),
  );
  await rebuildIndexes();
}

export async function deleteChapter(bookSlug: string, chapterSlug: string) {
  const book = await getBook(bookSlug);
  const existing = book.chapters.find((chapter) => chapter.meta.slug === chapterSlug);
  if (!existing) {
    throw new Error("Chapter not found");
  }

  const remainingChapters = book.chapters.filter(
    (chapter) => chapter.meta.slug !== chapterSlug,
  );
  const bookPath = bookDirectory(bookSlug);
  const currentChaptersPath = path.join(bookPath, "chapters");
  const stagingPath = path.join(bookPath, `.chapters-delete-${Date.now()}`);
  const backupPath = path.join(bookPath, `.chapters-backup-${Date.now()}`);
  const now = new Date().toISOString();

  await createRevision(existing.id, existing.raw);
  await ensureDirectory(stagingPath);

  for (const [index, chapter] of remainingChapters.entries()) {
    await fs.writeFile(
      path.join(
        stagingPath,
        `${String(index + 1).padStart(3, "0")}-${chapter.meta.slug}.md`,
      ),
      renderMatter(
        {
          ...chapter.meta,
          order: index + 1,
          updatedAt: now,
        } satisfies ChapterMeta,
        chapter.body,
      ),
      "utf8",
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
  const note = await getNote(slug);
  const notes = await listNoteRecords();
  if (!note) {
    throw new Error("Note not found");
  }

  await createRevision(note.id, note.raw);
  await fs.rm(note.filePath, { force: true });
  const now = new Date().toISOString();
  await Promise.all(
    notes
      .filter((entry) => entry.meta.slug !== slug)
      .sort(
        (left, right) =>
          contentOrder(left.meta.order) - contentOrder(right.meta.order),
      )
      .map((entry, index) =>
        fs.writeFile(
          entry.filePath,
          renderMatter(
            {
              ...entry.meta,
              order: index + 1,
              updatedAt: now,
            } satisfies NoteMeta,
            entry.body,
          ),
          "utf8",
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
    const [bookSlug, chapterSlug] = location.split("/");
    const chapter = await getChapter(bookSlug, chapterSlug);
    if (!chapter) {
      throw new Error("Chapter not found");
    }
    return updateChapter(bookSlug, chapterSlug, {
      title: chapter.meta.title,
      slug: chapter.meta.slug,
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
    const [bookSlug, chapterSlug] = location.split("/");
    return getChapter(bookSlug, chapterSlug);
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
