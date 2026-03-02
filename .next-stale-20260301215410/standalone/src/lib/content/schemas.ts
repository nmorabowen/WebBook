import { z } from "zod";

export const statusSchema = z.enum(["draft", "published"]);
export const visibilitySchema = z.enum(["public", "private"]);

export const baseMetaSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().optional(),
});

export const bookMetaSchema = baseMetaSchema.extend({
  kind: z.literal("book"),
  description: z.string().optional(),
  status: statusSchema,
  visibility: visibilitySchema,
  coverImage: z.string().optional(),
  theme: z.enum(["paper", "graphite"]).optional(),
});

export const chapterMetaSchema = baseMetaSchema.extend({
  kind: z.literal("chapter"),
  bookSlug: z.string().min(1),
  order: z.number().int().nonnegative(),
  summary: z.string().optional(),
  status: statusSchema,
  allowExecution: z.boolean(),
});

export const noteMetaSchema = baseMetaSchema.extend({
  kind: z.literal("note"),
  summary: z.string().optional(),
  status: statusSchema,
  visibility: visibilitySchema,
  allowExecution: z.boolean(),
});

export type BookMeta = z.infer<typeof bookMetaSchema>;
export type ChapterMeta = z.infer<typeof chapterMetaSchema>;
export type NoteMeta = z.infer<typeof noteMetaSchema>;

export type BookRecord = {
  id: string;
  kind: "book";
  filePath: string;
  meta: BookMeta;
  body: string;
  raw: string;
  route: string;
  chapters: ChapterRecord[];
};

export type ChapterRecord = {
  id: string;
  kind: "chapter";
  filePath: string;
  meta: ChapterMeta;
  body: string;
  raw: string;
  route: string;
};

export type NoteRecord = {
  id: string;
  kind: "note";
  filePath: string;
  meta: NoteMeta;
  body: string;
  raw: string;
  route: string;
};

export type ContentRecord = BookRecord | ChapterRecord | NoteRecord;

export type ContentTree = {
  books: Array<{
    meta: BookMeta;
    route: string;
    chapters: Array<{
      meta: ChapterMeta;
      route: string;
    }>;
  }>;
  notes: Array<{
    meta: NoteMeta;
    route: string;
  }>;
};

export type SearchDocument = {
  id: string;
  title: string;
  kind: "book" | "chapter" | "note";
  route: string;
  summary: string;
  body: string;
};

export type ManifestEntry = {
  id: string;
  kind: "book" | "chapter" | "note";
  slug: string;
  title: string;
  route: string;
  status: "draft" | "published";
  visibility?: "public" | "private";
  allowExecution?: boolean;
  bookSlug?: string;
  summary?: string;
};

export const saveNoteSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().optional(),
  body: z.string(),
  status: statusSchema.default("draft"),
  visibility: visibilitySchema.default("private"),
  allowExecution: z.boolean().default(true),
  createRevision: z.boolean().optional(),
});

export const saveBookSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  body: z.string(),
  status: statusSchema.default("draft"),
  visibility: visibilitySchema.default("private"),
  theme: z.enum(["paper", "graphite"]).default("paper"),
  createRevision: z.boolean().optional(),
});

export const saveChapterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().optional(),
  body: z.string(),
  status: statusSchema.default("draft"),
  allowExecution: z.boolean().default(true),
  order: z.number().int().nonnegative(),
  createRevision: z.boolean().optional(),
});

export const restoreRevisionSchema = z.object({
  id: z.string().min(1),
  revisionFile: z.string().min(1),
});
