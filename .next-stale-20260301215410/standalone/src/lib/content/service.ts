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
  type ManifestEntry,
  type NoteMeta,
  type NoteRecord,
  noteMetaSchema,
  restoreRevisionSchema,
  saveBookSchema,
  saveChapterSchema,
  saveNoteSchema,
  type SearchDocument,
} from "@/lib/content/schemas";
import { env } from "@/lib/env";
import { isSafeSlug, safeJsonParse, stripMarkdown, toSlug } from "@/lib/utils";

const contentRoot = path.join(process.cwd(), env.contentRoot);
const booksRoot = path.join(contentRoot, "books");
const notesRoot = path.join(contentRoot, "notes");
const systemRoot = path.join(contentRoot, ".webbook");
const revisionsRoot = path.join(systemRoot, "revisions");
const indexesRoot = path.join(systemRoot, "indexes");

type IndexState = {
  manifest: ManifestEntry[];
  backlinks: Record<string, ManifestEntry[]>;
  search: string;
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

function noteFilePath(slug: string) {
  return path.join(notesRoot, `${slug}.md`);
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
    storeFields: ["id", "title", "kind", "route", "summary"],
  });
  miniSearch.addAll(documents);
  return miniSearch.toJSON();
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

function noteId(slug: string) {
  return `note:${slug}`;
}

function bookId(slug: string) {
  return `book:${slug}`;
}

function chapterId(bookSlug: string, slug: string) {
  return `chapter:${bookSlug}/${slug}`;
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
  return books.sort((left, right) => left.meta.title.localeCompare(right.meta.title));
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
  return notes.sort((left, right) => left.meta.title.localeCompare(right.meta.title));
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
      visibility: book.meta.visibility,
      summary: book.meta.description,
    };

    manifest.push(bookEntry);
    documents.push({
      id: book.id,
      title: book.meta.title,
      kind: "book",
      route: book.route,
      summary: book.meta.description ?? "",
      body: stripMarkdown(book.body),
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
      };

      manifest.push(chapterEntry);
      documents.push({
        id: chapter.id,
        title: chapter.meta.title,
        kind: "chapter",
        route: chapter.route,
        summary: chapter.meta.summary ?? "",
        body: stripMarkdown(chapter.body),
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
      visibility: note.meta.visibility,
      allowExecution: note.meta.allowExecution,
      summary: note.meta.summary,
    };

    manifest.push(noteEntry);
    documents.push({
      id: note.id,
      title: note.meta.title,
      kind: "note",
      route: note.route,
      summary: note.meta.summary ?? "",
      body: stripMarkdown(note.body),
    });
    buildAliases(noteEntry).forEach((alias) => aliasLookup.set(alias, noteEntry));
  }

  const allContent = [
    ...content.books.flatMap<ContentRecord>((book) => [book, ...book.chapters]),
    ...content.notes,
  ];

  for (const item of allContent) {
    for (const target of extractWikiTargets(item.body)) {
      const resolved = aliasLookup.get(target);
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
          visibility:
            item.kind === "note" || item.kind === "book"
              ? item.meta.visibility
              : undefined,
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
  ]);

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
        status: "published",
        visibility: "public",
        theme: "paper",
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
        status: "published",
        visibility: "public",
        allowExecution: true,
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

export async function listContent() {
  await ensureContentScaffold();
  const [books, notes] = await Promise.all([listBookRecords(), listNoteRecords()]);
  return { books, notes };
}

export async function rebuildIndexes() {
  const [books, notes] = await Promise.all([listBookRecords(), listNoteRecords()]);
  await writeIndexes({ books, notes });
}

export async function getContentTree(): Promise<ContentTree> {
  const { books, notes } = await listContent();
  return {
    books: books.map((book) => ({
      meta: book.meta,
      route: book.route,
      chapters: book.chapters.map((chapter) => ({
        meta: chapter.meta,
        route: chapter.route,
      })),
    })),
    notes: notes.map((note) => ({
      meta: note.meta,
      route: note.route,
    })),
  };
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
  if (book.meta.status !== "published" || book.meta.visibility !== "public") {
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
  if (!note || note.meta.status !== "published" || note.meta.visibility !== "public") {
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
    storeFields: ["id", "title", "kind", "route", "summary"],
  });
  return miniSearch.search(query, {
    combineWith: "AND",
    prefix: true,
    fuzzy: 0.2,
  });
}

export async function getBacklinks(id: string) {
  const { backlinks } = await loadIndexes();
  return backlinks[id] ?? [];
}

export async function getManifest() {
  const { manifest } = await loadIndexes();
  return manifest;
}

export async function unresolvedWikiLinks(markdown: string) {
  const manifest = await getManifest();
  const aliases = new Set(
    manifest.flatMap((entry) => [
      entry.slug,
      entry.kind === "chapter" && entry.bookSlug
        ? `${entry.bookSlug}/${entry.slug}`
        : null,
    ]),
  );
  return extractWikiTargets(markdown).filter((target) => !aliases.has(target));
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
  const now = new Date().toISOString();
  const directoryPath = bookDirectory(slug);
  await ensureDirectory(path.join(directoryPath, "chapters"));
  const raw = renderMatter(
    {
      kind: "book",
      title: data.title,
      slug,
      description: data.description,
      status: data.status,
      visibility: data.visibility,
      theme: data.theme,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === "published" ? now : undefined,
    } satisfies BookMeta,
    data.body,
  );
  await fs.writeFile(bookFilePath(slug), raw, "utf8");
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
      visibility: data.visibility,
      theme: data.theme,
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
  await fs.writeFile(existing.filePath, raw, "utf8");
  await rebuildIndexes();
  return getBook(existing.meta.slug);
}

export async function createChapter(bookSlug: string, input: unknown) {
  const book = await getBook(bookSlug);
  const data = saveChapterSchema.parse(input);
  const slug = toSlug(data.slug);
  ensureSafeSlugOrThrow(slug);
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
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === "published" ? now : undefined,
    } satisfies ChapterMeta,
    data.body,
  );
  await fs.writeFile(chapterFilePath(book.meta.slug, slug, data.order), raw, "utf8");
  await rebuildIndexes();
  return getChapter(book.meta.slug, slug);
}

export async function updateChapter(
  bookSlug: string,
  chapterSlug: string,
  input: unknown,
) {
  const existing = await getChapter(bookSlug, chapterSlug);
  if (!existing) {
    throw new Error("Chapter not found");
  }
  const data = saveChapterSchema.parse(input);
  const now = new Date().toISOString();
  const nextSlug = toSlug(data.slug);
  ensureSafeSlugOrThrow(nextSlug);
  const raw = renderMatter(
    {
      ...existing.meta,
      title: data.title,
      slug: nextSlug,
      order: data.order,
      summary: data.summary,
      status: data.status,
      allowExecution: data.allowExecution,
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
  if (existing.filePath !== nextPath) {
    await fs.rm(existing.filePath);
  }
  await fs.writeFile(nextPath, raw, "utf8");
  await rebuildIndexes();
  return getChapter(existing.meta.bookSlug, nextSlug);
}

export async function createNote(input: unknown) {
  const data = saveNoteSchema.parse(input);
  const slug = toSlug(data.slug);
  ensureSafeSlugOrThrow(slug);
  const now = new Date().toISOString();
  const raw = renderMatter(
    {
      kind: "note",
      title: data.title,
      slug,
      summary: data.summary,
      status: data.status,
      visibility: data.visibility,
      allowExecution: data.allowExecution,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.status === "published" ? now : undefined,
    } satisfies NoteMeta,
    data.body,
  );
  await fs.writeFile(noteFilePath(slug), raw, "utf8");
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
      visibility: data.visibility,
      allowExecution: data.allowExecution,
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
  await fs.writeFile(existing.filePath, raw, "utf8");
  await rebuildIndexes();
  return getNote(existing.meta.slug);
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
      visibility: published ? "public" : note.meta.visibility,
      allowExecution: note.meta.allowExecution,
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
      visibility: published ? "public" : book.meta.visibility,
      theme: book.meta.theme ?? "paper",
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
  const revisionDirectory = path.join(revisionsRoot, data.id.replace(/[/:]/g, "_"));
  const revisionPath = path.join(revisionDirectory, data.revisionFile);
  const raw = await fs.readFile(revisionPath, "utf8");
  await createRevision(data.id, target.raw);
  await fs.writeFile(target.filePath, raw, "utf8");
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
