import { z } from "zod";
import { fontPresetValues } from "@/lib/font-presets";
import { mathJaxFontValues } from "@/lib/mathjax-fonts";

export const statusSchema = z.enum(["draft", "published"]);
export const visibilitySchema = z.enum(["public", "private"]);
export const fontPresetSchema = z.enum(fontPresetValues);
export const mathJaxFontFamilySchema = z.enum(mathJaxFontValues);
export const bookTypographySchema = z.object({
  bodyFontSize: z.number().min(0.9).max(1.6),
  bodyLineHeight: z.number().min(1.4).max(2.4),
  headingBaseSize: z.number().min(2.2).max(5),
  headingScale: z.number().min(1.05).max(1.8),
  headingIndentStep: z.number().min(0).max(3),
  paragraphSpacing: z.number().min(0.5).max(2.4),
  contentWidth: z.number().min(32).max(180),
});

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
  fontPreset: fontPresetSchema.optional(),
  typography: bookTypographySchema.optional(),
});

export const chapterMetaSchema = baseMetaSchema.extend({
  kind: z.literal("chapter"),
  bookSlug: z.string().min(1),
  order: z.number().int().nonnegative(),
  summary: z.string().optional(),
  status: statusSchema,
  allowExecution: z.boolean(),
  fontPreset: fontPresetSchema.optional(),
});

export const noteMetaSchema = baseMetaSchema.extend({
  kind: z.literal("note"),
  summary: z.string().optional(),
  status: statusSchema,
  visibility: visibilitySchema,
  allowExecution: z.boolean(),
  fontPreset: fontPresetSchema.optional(),
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
  fontPreset: fontPresetSchema.default("source-serif"),
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
  fontPreset: fontPresetSchema.default("source-serif"),
  typography: bookTypographySchema.optional(),
  createRevision: z.boolean().optional(),
});

export const saveChapterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().optional(),
  body: z.string(),
  status: statusSchema.default("draft"),
  allowExecution: z.boolean().default(true),
  fontPreset: fontPresetSchema.default("source-serif"),
  order: z.number().int().nonnegative(),
  createRevision: z.boolean().optional(),
});

export const restoreRevisionSchema = z.object({
  id: z.string().min(1),
  revisionFile: z.string().min(1),
});

export const reorderChaptersSchema = z.object({
  chapterSlugs: z.array(z.string().min(1)).min(1),
});

export const generalSettingsSchema = z.object({
  cornerRadius: z.number().min(0).max(40),
  tileSpacing: z.number().min(0.15).max(2.5),
  collapseBookChaptersByDefault: z.boolean(),
  mathFontSize: z.number().min(0.8).max(2.5),
  mathFontColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
  mathFontFamily: mathJaxFontFamilySchema,
});

export const saveGeneralSettingsSchema = generalSettingsSchema;

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
