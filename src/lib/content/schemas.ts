import { z } from "zod";
import { fontPresetValues } from "@/lib/font-presets";
import { mathJaxFontValues } from "@/lib/mathjax-fonts";
import { bookTypographyLimits } from "@/lib/book-typography";
import { colorThemeValues } from "@/lib/color-themes";
import { GENERAL_SETTINGS_LIMITS } from "@/lib/general-settings-config";

export const statusSchema = z.enum(["draft", "published"]);
export const fontPresetSchema = z.enum(fontPresetValues);
export const mathJaxFontFamilySchema = z.enum(mathJaxFontValues);
export const colorThemeSchema = z.enum(colorThemeValues);
export const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/);
export const analyticsMeasurementIdSchema = z
  .string()
  .trim()
  .regex(/^$|^G-[A-Za-z0-9]+$/);
export const analyticsGtmContainerIdSchema = z
  .string()
  .trim()
  .regex(/^$|^GTM-[A-Z0-9]+$/);
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
  order: z.number().int().nonnegative().optional(),
  status: statusSchema,
  featured: z.boolean().optional(),
  featuredAt: z.string().optional(),
  coverImage: z.string().optional(),
  coverColor: hexColorSchema.optional(),
  theme: z.enum(["paper", "graphite"]).optional(),
  fontPreset: fontPresetSchema.optional(),
  typography: bookTypographySchema.optional(),
});

export const chapterMetaSchema = baseMetaSchema.extend({
  kind: z.literal("chapter"),
  bookSlug: z.string().min(1),
  order: z.number().int().positive(),
  summary: z.string().optional(),
  status: statusSchema,
  allowExecution: z.boolean(),
  fontPreset: fontPresetSchema.optional(),
});

export const noteMetaSchema = baseMetaSchema.extend({
  kind: z.literal("note"),
  summary: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
  status: statusSchema,
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
  path: string[];
  body: string;
  raw: string;
  route: string;
  children: ChapterRecord[];
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
    chapters: ChapterTreeNode[];
  }>;
  notes: Array<{
    meta: NoteMeta;
    route: string;
  }>;
};

export type ChapterTreeNode = {
  meta: ChapterMeta;
  route: string;
  path: string[];
  children: ChapterTreeNode[];
};

export type SearchDocument = {
  id: string;
  title: string;
  kind: "book" | "chapter" | "note";
  slug: string;
  bookSlug?: string;
  status: "draft" | "published";
  summary: string;
  body: string;
  publicRoute: string;
  workspaceRoute: string;
};

export type ContentSearchResult = {
  id: string;
  title: string;
  kind: "book" | "chapter" | "note";
  slug: string;
  bookSlug?: string;
  status: "draft" | "published";
  summary: string;
  route: string;
  publicRoute: string;
  workspaceRoute: string;
};

export type ManifestHeading = {
  id: string;
  value: string;
  depth: number;
};

export type ManifestEntry = {
  id: string;
  kind: "book" | "chapter" | "note";
  slug: string;
  title: string;
  route: string;
  status: "draft" | "published";
  allowExecution?: boolean;
  bookSlug?: string;
  chapterPath?: string[];
  summary?: string;
  headings?: ManifestHeading[];
};

export type MediaReference = Pick<ManifestEntry, "id" | "kind" | "title" | "route">;

export type MediaAsset = {
  name: string;
  url: string;
  relativePath: string | null;
  folder: string | null;
  size: number | null;
  modifiedAt: string | null;
  missing: boolean;
  references: MediaReference[];
};

export const saveNoteSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().optional(),
  body: z.string(),
  status: statusSchema.default("draft"),
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
  featured: z.boolean().default(false),
  coverColor: hexColorSchema.default("#292118"),
  fontPreset: fontPresetSchema.default("source-serif"),
  typography: bookTypographySchema.optional(),
  createRevision: z.boolean().optional(),
});

const chapterContentFields = {
  title: z.string().min(1),
  slug: z.string().min(1),
  summary: z.string().optional(),
  body: z.string(),
  status: statusSchema.default("draft"),
  allowExecution: z.boolean().default(true),
  fontPreset: fontPresetSchema.default("source-serif"),
  createRevision: z.boolean().optional(),
} as const;

export const createChapterSchema = z.object({
  ...chapterContentFields,
  parentChapterPath: z.array(z.string().min(1)).default([]),
  order: z.number().int().positive(),
});

export const updateChapterContentSchema = z.object({
  ...chapterContentFields,
});

export const restoreRevisionSchema = z.object({
  id: z.string().min(1),
  revisionFile: z.string().min(1).regex(/^[^\\/]+$/),
});

export const reorderChaptersSchema = z.object({
  parentChapterPath: z.array(z.string().min(1)).default([]),
  chapterSlugs: z.array(z.string().min(1)).min(1),
});

export const moveChapterSchema = z.object({
  chapterPath: z.array(z.string().min(1)).min(1),
  parentChapterPath: z.array(z.string().min(1)).default([]),
  order: z.number().int().positive().optional(),
});

export const reorderBooksSchema = z.object({
  bookSlugs: z.array(z.string().min(1)).min(1),
});

export const reorderNotesSchema = z.object({
  noteSlugs: z.array(z.string().min(1)).min(1),
});

export const generalSettingsSchema = z.object({
  colorTheme: colorThemeSchema,
  analyticsMeasurementId: analyticsMeasurementIdSchema,
  analyticsGtmContainerId: analyticsGtmContainerIdSchema,
  cornerRadius: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.cornerRadius.min)
    .max(GENERAL_SETTINGS_LIMITS.cornerRadius.max),
  tileSpacing: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.tileSpacing.min)
    .max(GENERAL_SETTINGS_LIMITS.tileSpacing.max),
  dividerSpacing: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.dividerSpacing.min)
    .max(GENERAL_SETTINGS_LIMITS.dividerSpacing.max),
  dividerColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
  dividerWidth: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.dividerWidth.min)
    .max(GENERAL_SETTINGS_LIMITS.dividerWidth.max),
  dividerBackgroundSize: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.dividerBackgroundSize.min)
    .max(GENERAL_SETTINGS_LIMITS.dividerBackgroundSize.max),
  collapseBookChaptersByDefault: z.boolean(),
  mathFontSize: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.mathFontSize.min)
    .max(GENERAL_SETTINGS_LIMITS.mathFontSize.max),
  mathFontColor: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
  mathFontFamily: mathJaxFontFamilySchema,
  mathInlineVerticalAlign: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.mathInlineVerticalAlign.min)
    .max(GENERAL_SETTINGS_LIMITS.mathInlineVerticalAlign.max),
  mathInlineTranslateY: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.mathInlineTranslateY.min)
    .max(GENERAL_SETTINGS_LIMITS.mathInlineTranslateY.max),
  imageUploadLimitMb: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.imageUploadLimitMb.min)
    .max(GENERAL_SETTINGS_LIMITS.imageUploadLimitMb.max),
  fileUploadLimitMb: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.fileUploadLimitMb.min)
    .max(GENERAL_SETTINGS_LIMITS.fileUploadLimitMb.max),
  workspaceTransferLimitMb: z
    .number()
    .min(GENERAL_SETTINGS_LIMITS.workspaceTransferLimitMb.min)
    .max(GENERAL_SETTINGS_LIMITS.workspaceTransferLimitMb.max),
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
