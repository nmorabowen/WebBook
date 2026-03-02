import { z } from "zod";
import { fontPresetValues } from "@/lib/font-presets";
import { mathJaxFontValues } from "@/lib/mathjax-fonts";
import { bookTypographyLimits } from "@/lib/book-typography";
import { colorThemeValues } from "@/lib/color-themes";
import { GENERAL_SETTINGS_LIMITS } from "@/lib/general-settings-config";

export const statusSchema = z.enum(["draft", "published"]);
export const visibilitySchema = z.enum(["public", "private"]);
export const fontPresetSchema = z.enum(fontPresetValues);
export const mathJaxFontFamilySchema = z.enum(mathJaxFontValues);
export const colorThemeSchema = z.enum(colorThemeValues);
export const bookTypographySchema = z.object({
  bodyFontSize: z
    .number()
    .min(bookTypographyLimits.bodyFontSize.min)
    .max(bookTypographyLimits.bodyFontSize.max),
  bodyLineHeight: z
    .number()
    .min(bookTypographyLimits.bodyLineHeight.min)
    .max(bookTypographyLimits.bodyLineHeight.max),
  headingBaseSize: z
    .number()
    .min(bookTypographyLimits.headingBaseSize.min)
    .max(bookTypographyLimits.headingBaseSize.max),
  headingScale: z
    .number()
    .min(bookTypographyLimits.headingScale.min)
    .max(bookTypographyLimits.headingScale.max),
  headingIndentStep: z
    .number()
    .min(bookTypographyLimits.headingIndentStep.min)
    .max(bookTypographyLimits.headingIndentStep.max),
  paragraphSpacing: z
    .number()
    .min(bookTypographyLimits.paragraphSpacing.min)
    .max(bookTypographyLimits.paragraphSpacing.max),
  contentWidth: z
    .number()
    .min(bookTypographyLimits.contentWidth.min)
    .max(bookTypographyLimits.contentWidth.max),
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
  typography: bookTypographySchema.optional(),
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
  typography: bookTypographySchema.optional(),
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
  colorTheme: colorThemeSchema,
  cornerRadius: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.cornerRadius.min)
    .max(GENERAL_SETTINGS_LIMITS.cornerRadius.max),
  tileSpacing: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.tileSpacing.min)
    .max(GENERAL_SETTINGS_LIMITS.tileSpacing.max),
  collapseBookChaptersByDefault: z.boolean(),
  mathFontSize: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.mathFontSize.min)
    .max(GENERAL_SETTINGS_LIMITS.mathFontSize.max),
  mathFontColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
  mathFontFamily: mathJaxFontFamilySchema,
  appSidebarWidth: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.appSidebarWidth.min)
    .max(GENERAL_SETTINGS_LIMITS.appSidebarWidth.max),
  appInspectorWidth: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.appInspectorWidth.min)
    .max(GENERAL_SETTINGS_LIMITS.appInspectorWidth.max),
  publicLeftPanelWidth: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.min)
    .max(GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.max),
  publicRightPanelWidth: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.publicRightPanelWidth.min)
    .max(GENERAL_SETTINGS_LIMITS.publicRightPanelWidth.max),
});

export const saveGeneralSettingsSchema = generalSettingsSchema;

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
