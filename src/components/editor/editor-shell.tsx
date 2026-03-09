"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type InputHTMLAttributes,
} from "react";
import JSZip from "jszip";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronLeft,
  Code2,
  CloudUpload,
  ExternalLink,
  FolderOpen,
  Globe,
  GripVertical,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  PanelLeft,
  PanelRight,
  RefreshCcw,
  Save,
  Sigma,
  Sparkles,
  Pencil,
  Trash2,
  Youtube,
  Columns2,
} from "lucide-react";
import {
  bookTypographyLimits,
  bookTypographyStyle,
  defaultBookTypography,
  defaultNoteTypography,
  normalizeBookTypography,
  type BookTypography,
} from "@/lib/book-typography";
import { bookCoverColorPresets } from "@/lib/book-cover-colors";
import type { ManifestEntry, MediaAsset } from "@/lib/content/schemas";
import { fontPresetOptions, type FontPreset } from "@/lib/font-presets";
import { mathAutocompleteItems, type MathAutocompleteItem } from "@/lib/math-autocomplete";
import { defaultUploadTargetPathForRoute } from "@/lib/media-paths";
import {
  EDITOR_SHORTCUTS_UPDATED_EVENT,
  defaultEditorShortcuts,
  loadEditorShortcuts,
  shortcutFromKeyboardEvent,
  type EditorShortcutMap,
  type ShortcutActionId,
} from "@/lib/editor-shortcuts";
import { extractToc, splitWikiTarget, type TocItem } from "@/lib/markdown/shared";
import { buildInlineTextStyleHref, cn, normalizeYouTubeEmbedInput, toSlug } from "@/lib/utils";
import { formatRelativeDate } from "@/lib/utils";
import {
  applyPreviewVisibleLineUpdate,
  beginPreviewReload,
  createPreviewSyncState,
  setPreviewAnchorLine,
  setRenderedPreviewLine,
} from "@/components/editor/preview-sync";

type MathJaxRuntime = {
  startup?: {
    promise?: Promise<void>;
  };
  typesetClear?: (elements?: Element[]) => void;
  typesetPromise?: (elements?: Element[]) => Promise<void>;
};

type EditorShellProps = {
  mode: "note" | "book" | "chapter";
  path: string;
  pageId: string;
  publicRoute?: string;
  manifest: ManifestEntry[];
  initialValues: {
    title: string;
    slug: string;
    summary?: string;
    description?: string;
    body: string;
    status: "draft" | "published";
    featured?: boolean;
    coverColor?: string;
    allowExecution?: boolean;
    fontPreset?: FontPreset;
    typography?: Partial<BookTypography>;
  };
  toc: TocItem[];
  backlinks: ManifestEntry[];
  unresolvedLinks: string[];
  revisions: string[];
  mediaAssets: MediaAsset[];
  updateEndpoint: string;
  extraActions?: React.ReactNode;
  shortcutScopeKey?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type EditorSnapshot = {
  body: string;
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
  scrollLeft: number;
};
type ImageUploadPayload = {
  ok: boolean;
  url: string;
  fileName: string;
  alt: string;
};
type FileUploadPayload = {
  ok: boolean;
  url: string;
  fileName: string;
  originalName: string;
};
type SaveResponsePayload = {
  id?: string;
  kind?: "book" | "note" | "chapter";
  route?: string;
  path?: string[];
  meta?: {
    slug: string;
    bookSlug?: string;
  };
};
type WikiAutocompleteContext = {
  start: number;
  end: number;
  query: string;
};
type WikiAutocompleteItem = {
  id: string;
  label: string;
  insertValue: string;
  detail: string;
  kind: "book" | "chapter" | "note" | "heading";
};
type MathAutocompleteContext = {
  start: number;
  end: number;
  query: string;
};

type EditorSavePayload = {
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published";
  featured?: boolean;
  coverColor?: string;
  allowExecution?: boolean;
  summary?: string;
  description?: string;
  fontPreset?: FontPreset;
  typography?: BookTypography;
};

type WikiTargetParts = {
  pageTarget: string;
  headingTarget?: string;
  hasHeadingMarker: boolean;
};

const inlineTextSizeOptions = [
  { value: "inherit", label: "Text size" },
  { value: "0.9em", label: "Small" },
  { value: "1em", label: "Base" },
  { value: "1.15em", label: "Large" },
  { value: "1.3em", label: "XL" },
] as const;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
const pairedDelimiters = {
  "(": ")",
  "[": "]",
  "{": "}",
} as const;
const closingDelimiters = new Set<string>(Object.values(pairedDelimiters));

function buildEditorSavePayload(input: {
  mode: EditorShellProps["mode"];
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published";
  featured: boolean;
  coverColor: string;
  allowExecution: boolean;
  summary: string;
  fontPreset: FontPreset;
  typography: BookTypography;
}): EditorSavePayload {
  return {
    title: input.title,
    slug: input.slug,
    body: input.body,
    status: input.status,
    featured: input.mode === "book" ? input.featured : undefined,
    coverColor: input.mode === "book" ? input.coverColor : undefined,
    allowExecution: input.allowExecution,
    summary: input.mode === "note" || input.mode === "chapter" ? input.summary : undefined,
    description: input.mode === "book" ? input.summary : undefined,
    fontPreset: input.fontPreset,
    typography: input.mode === "book" || input.mode === "note" ? input.typography : undefined,
  };
}

function detectWikiAutocompleteContext(
  content: string,
  caretOffset: number,
): WikiAutocompleteContext | null {
  const safeOffset = Math.max(0, Math.min(caretOffset, content.length));
  const contentBeforeCaret = content.slice(0, safeOffset);
  const openIndex = contentBeforeCaret.lastIndexOf("[[");
  if (openIndex < 0) {
    return null;
  }

  const closingIndex = contentBeforeCaret.lastIndexOf("]]");
  if (closingIndex > openIndex) {
    return null;
  }

  const query = content.slice(openIndex + 2, safeOffset);
  if (query.includes("\n") || query.includes("\r")) {
    return null;
  }

  return {
    start: openIndex + 2,
    end: safeOffset,
    query,
  };
}

function isEscaped(content: string, index: number) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function isLikelyMathContext(content: string, caretOffset: number) {
  let inlineMathOpen = false;
  let displayMathOpen = false;
  let parenMathOpen = false;
  let bracketMathOpen = false;

  for (let index = 0; index < caretOffset; index += 1) {
    const current = content[index];
    const next = content[index + 1];

    if (current === "\\" && next === "(") {
      parenMathOpen = true;
      index += 1;
      continue;
    }

    if (current === "\\" && next === ")") {
      parenMathOpen = false;
      index += 1;
      continue;
    }

    if (current === "\\" && next === "[") {
      bracketMathOpen = true;
      index += 1;
      continue;
    }

    if (current === "\\" && next === "]") {
      bracketMathOpen = false;
      index += 1;
      continue;
    }

    if (current !== "$" || isEscaped(content, index)) {
      continue;
    }

    if (next === "$") {
      displayMathOpen = !displayMathOpen;
      index += 1;
      continue;
    }

    inlineMathOpen = !inlineMathOpen;
  }

  return inlineMathOpen || displayMathOpen || parenMathOpen || bracketMathOpen;
}

function detectMathAutocompleteContext(
  content: string,
  caretOffset: number,
): MathAutocompleteContext | null {
  if (!isLikelyMathContext(content, caretOffset)) {
    return null;
  }

  const safeOffset = Math.max(0, Math.min(caretOffset, content.length));
  const beforeCaret = content.slice(0, safeOffset);
  const match = beforeCaret.match(/\\([A-Za-z]*)$/);
  if (!match || match.index === undefined) {
    return null;
  }

  return {
    start: match.index,
    end: safeOffset,
    query: match[1] ?? "",
  };
}

function manifestEntryAliases(entry: ManifestEntry) {
  const aliases = [entry.slug];
  if (entry.kind === "chapter" && entry.bookSlug) {
    const canonicalPath = entry.chapterPath?.join("/") ?? entry.slug;
    aliases.unshift(`${entry.bookSlug}/${canonicalPath}`);
    aliases.push(`${entry.bookSlug}/${entry.slug}`);
  }
  for (const alias of entry.routeAliases ?? []) {
    aliases.push(alias.location);
  }
  return Array.from(new Set(aliases));
}

function wikiEntryTypeLabel(entry: ManifestEntry) {
  if (entry.kind === "chapter") {
    return "Chapter";
  }

  if (entry.kind === "book") {
    return "Book";
  }

  return "Note";
}

function scoreWikiEntryMatch(
  entry: ManifestEntry,
  query: string,
  currentEntry: ManifestEntry | null,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const aliases = manifestEntryAliases(entry).map((alias) => alias.toLowerCase());
  const title = entry.title.toLowerCase();
  const summary = entry.summary?.toLowerCase() ?? "";
  const kindBoost = currentEntry?.kind === entry.kind ? -0.2 : 0;
  const sameBookBoost =
    currentEntry?.kind === "chapter" &&
    entry.kind === "chapter" &&
    currentEntry.bookSlug &&
    currentEntry.bookSlug === entry.bookSlug
      ? -0.3
      : 0;

  if (!normalizedQuery) {
    return 50 + kindBoost + sameBookBoost;
  }

  if (aliases.includes(normalizedQuery)) {
    return 0 + kindBoost + sameBookBoost;
  }

  if (title === normalizedQuery) {
    return 0.5 + kindBoost + sameBookBoost;
  }

  if (aliases.some((alias) => alias.startsWith(normalizedQuery))) {
    return 1 + kindBoost + sameBookBoost;
  }

  if (title.startsWith(normalizedQuery)) {
    return 2 + kindBoost + sameBookBoost;
  }

  if (aliases.some((alias) => alias.includes(normalizedQuery))) {
    return 3 + kindBoost + sameBookBoost;
  }

  if (title.includes(normalizedQuery)) {
    return 4 + kindBoost + sameBookBoost;
  }

  if (summary.includes(normalizedQuery)) {
    return 5 + kindBoost + sameBookBoost;
  }

  return Number.POSITIVE_INFINITY;
}

function getRankedWikiEntries(
  manifest: ManifestEntry[],
  query: string,
  currentEntry: ManifestEntry | null,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const exactMatches = manifest.filter((entry) => {
    if (!normalizedQuery) {
      return false;
    }

    const aliases = manifestEntryAliases(entry).map((alias) => alias.toLowerCase());
    return aliases.includes(normalizedQuery) || entry.title.toLowerCase() === normalizedQuery;
  });

  if (exactMatches.length > 0) {
    return exactMatches;
  }

  return manifest
    .map((entry) => ({
      entry,
      score: scoreWikiEntryMatch(entry, query, currentEntry),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.entry.title.localeCompare(right.entry.title);
    })
    .map((candidate) => candidate.entry);
}

function scoreHeadingMatch(value: string, id: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 50;
  }

  const normalizedValue = value.toLowerCase();
  const normalizedId = id.toLowerCase();

  if (normalizedValue === normalizedQuery || normalizedId === normalizedQuery) {
    return 0;
  }

  if (normalizedValue.startsWith(normalizedQuery) || normalizedId.startsWith(normalizedQuery)) {
    return 1;
  }

  if (normalizedValue.includes(normalizedQuery) || normalizedId.includes(normalizedQuery)) {
    return 2;
  }

  return Number.POSITIVE_INFINITY;
}

function parseWikiAutocompleteQuery(query: string): WikiTargetParts {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { pageTarget: "", hasHeadingMarker: false };
  }

  const hashIndex = trimmedQuery.indexOf("#");
  if (hashIndex < 0) {
    return {
      pageTarget: trimmedQuery,
      hasHeadingMarker: false,
    };
  }

  return {
    ...splitWikiTarget(trimmedQuery),
    hasHeadingMarker: true,
  };
}

function BookSettingsSpine() {
  return (
    <>
      <BookIconStripe />
      <span className="absolute inset-y-3 right-2 w-1.5 rounded-full bg-[rgba(15,12,9,0.55)]" />
    </>
  );
}

function BookIconStripe() {
  return <GripVertical className="h-4 w-4 text-[rgba(247,237,220,0.82)]" />;
}

function splitMediaName(name: string) {
  const lastDot = name.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === name.length - 1) {
    return {
      baseName: name,
      extension: "",
    };
  }

  return {
    baseName: name.slice(0, lastDot),
    extension: name.slice(lastDot),
  };
}

function mediaRelativePathFromUrl(url: string) {
  if (!url.startsWith("/media/")) {
    return null;
  }

  return url.slice("/media/".length).replace(/^\/+|\/+$/g, "") || null;
}

export function EditorShell({
  mode,
  path,
  pageId,
  publicRoute,
  manifest,
  initialValues,
  toc,
  backlinks,
  unresolvedLinks,
  revisions,
  mediaAssets,
  updateEndpoint,
  extraActions,
  shortcutScopeKey = "workspace",
}: EditorShellProps) {
  const router = useRouter();
  const workspacePanelStyle = {
    borderRadius: "var(--workspace-corner-radius, 28px)",
  } as CSSProperties;
  const workspaceGapStyle = {
    gap: "var(--workspace-tile-spacing, 1.5rem)",
  } as CSSProperties;
  const [currentPath, setCurrentPath] = useState(path);
  const [currentPageId, setCurrentPageId] = useState(pageId);
  const [currentPublicRoute, setCurrentPublicRoute] = useState(publicRoute);
  const [currentUpdateEndpoint, setCurrentUpdateEndpoint] = useState(updateEndpoint);
  const [title, setTitle] = useState(initialValues.title);
  const [slug, setSlug] = useState(initialValues.slug);
  const [slugTouched, setSlugTouched] = useState(
    initialValues.slug !== toSlug(initialValues.title),
  );
  const [summary, setSummary] = useState(initialValues.summary ?? initialValues.description ?? "");
  const [body, setBody] = useState(initialValues.body);
  const [status, setStatus] = useState<"draft" | "published">(initialValues.status);
  const [featured, setFeatured] = useState(initialValues.featured ?? false);
  const [coverColor, setCoverColor] = useState(initialValues.coverColor ?? "#292118");
  const [allowExecution, setAllowExecution] = useState(initialValues.allowExecution ?? true);
  const [fontPreset, setFontPreset] = useState<FontPreset>(
    initialValues.fontPreset ?? "archivo-narrow",
  );
  const [typography, setTypography] = useState<BookTypography>(
    normalizeBookTypography(
      initialValues.typography,
      mode === "note" ? defaultNoteTypography : defaultBookTypography,
    ),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>("Ready");
  const [imageUploadPending, setImageUploadPending] = useState(false);
  const [fileUploadPending, setFileUploadPending] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [editorSplitRatio, setEditorSplitRatio] = useState(52);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [rightPanelRoot, setRightPanelRoot] = useState<HTMLElement | null>(null);
  const [inlineTextSize, setInlineTextSize] = useState<(typeof inlineTextSizeOptions)[number]["value"]>("inherit");
  const [inlineTextColor, setInlineTextColor] = useState("#8f5335");
  const [editorShortcuts, setEditorShortcuts] = useState<EditorShortcutMap>(
    defaultEditorShortcuts,
  );
  const [pageMediaAssets, setPageMediaAssets] = useState<MediaAsset[]>(mediaAssets);
  const [mediaRenamePendingUrl, setMediaRenamePendingUrl] = useState<string | null>(null);
  const [wikiAutocompleteContext, setWikiAutocompleteContext] =
    useState<WikiAutocompleteContext | null>(null);
  const [activeWikiAutocompleteIndex, setActiveWikiAutocompleteIndex] = useState(0);
  const [mathAutocompleteContext, setMathAutocompleteContext] =
    useState<MathAutocompleteContext | null>(null);
  const [activeMathAutocompleteIndex, setActiveMathAutocompleteIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const uploadBasePath = useMemo(
    () => defaultUploadTargetPathForRoute(mode, currentPublicRoute),
    [currentPublicRoute, mode],
  );
  const contentTypographyStyle = bookTypographyStyle(typography);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const mathAutocompletePanelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const uploadFolderInputRef = useRef<HTMLInputElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const editorSplitRef = useRef<HTMLDivElement>(null);
  const sourcePanelRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewExpandedRatioRef = useRef(52);
  const previewRefreshTimerRef = useRef<number | null>(null);
  const previewSyncStateRef = useRef(createPreviewSyncState());
  const bodyRef = useRef(initialValues.body);
  const sourceViewportRef = useRef({
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const historyRef = useRef<EditorSnapshot[]>([
    {
      body: initialValues.body,
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      scrollLeft: 0,
    },
  ]);
  const historyIndexRef = useRef(0);
  const pendingSelectionRef = useRef<{
    start: number;
    end: number;
    scrollTop: number;
    scrollLeft: number;
  } | null>(null);
  const lastSavedPayloadSignatureRef = useRef(
    JSON.stringify(
      buildEditorSavePayload({
        mode,
        title: initialValues.title,
        slug: initialValues.slug,
        body: initialValues.body,
        status: initialValues.status,
        featured: initialValues.featured ?? false,
        coverColor: initialValues.coverColor ?? "#292118",
        allowExecution: initialValues.allowExecution ?? true,
        summary: initialValues.summary ?? initialValues.description ?? "",
        fontPreset: initialValues.fontPreset ?? "archivo-narrow",
        typography: normalizeBookTypography(
          initialValues.typography,
          mode === "note" ? defaultNoteTypography : defaultBookTypography,
        ),
      }),
    ),
  );
  const isSourceCollapsed = editorSplitRatio <= 4;
  const isPreviewCollapsed = editorSplitRatio >= 96;
  const editorSplitStyle = {
    "--editor-source-fr": isSourceCollapsed ? "0.001fr" : `${editorSplitRatio}fr`,
    "--editor-preview-fr": isPreviewCollapsed
      ? "0.001fr"
      : `${100 - editorSplitRatio}fr`,
  } as CSSProperties;
  const currentManifestEntry = useMemo(
    () => manifest.find((entry) => entry.id === currentPageId) ?? null,
    [currentPageId, manifest],
  );
  const liveCurrentHeadings = useMemo(() => extractToc(body), [body]);
  const wikiAutocompleteSuggestions = useMemo(() => {
    if (!wikiAutocompleteContext) {
      return [];
    }

    const { pageTarget, headingTarget, hasHeadingMarker } = parseWikiAutocompleteQuery(
      wikiAutocompleteContext.query,
    );
    const normalizedHeadingTarget = (headingTarget ?? "").toLowerCase();

    if (wikiAutocompleteContext.query.trim().startsWith("#")) {
      return liveCurrentHeadings
        .map((heading) => ({
          heading,
          score: scoreHeadingMatch(heading.value, heading.id, normalizedHeadingTarget),
        }))
        .filter((candidate) => Number.isFinite(candidate.score))
        .sort((left, right) => {
          if (left.score !== right.score) {
            return left.score - right.score;
          }

          return left.heading.value.localeCompare(right.heading.value);
        })
        .slice(0, 8)
        .map(({ heading }) => ({
          id: `${currentManifestEntry?.id ?? "current"}#${heading.id}`,
          label: heading.value,
          insertValue: `#${heading.value}`,
          detail: currentManifestEntry
            ? `Heading in ${currentManifestEntry.title}`
            : "Heading on this page",
          kind: "heading" as const,
        }));
    }

    const rankedEntries = getRankedWikiEntries(manifest, pageTarget, currentManifestEntry);

    if (hasHeadingMarker) {
      return rankedEntries
        .slice(0, 4)
        .flatMap((entry) => {
          const primaryAlias = manifestEntryAliases(entry)[0] ?? entry.slug;
          const headingSource =
            entry.id === currentPageId ? liveCurrentHeadings : (entry.headings ?? []);
          return headingSource
            .map((heading) => ({
              heading,
              score: scoreHeadingMatch(
                heading.value,
                heading.id,
                normalizedHeadingTarget,
              ),
            }))
            .filter((candidate) => Number.isFinite(candidate.score))
            .sort((left, right) => {
              if (left.score !== right.score) {
                return left.score - right.score;
              }

              return left.heading.value.localeCompare(right.heading.value);
            })
            .map(({ heading }) => ({
              id: `${entry.id}#${heading.id}`,
              label: heading.value,
              insertValue: `${primaryAlias}#${heading.value}`,
              detail: `${entry.title} - ${primaryAlias}`,
              kind: "heading" as const,
            }));
        })
        .slice(0, 8);
    }

    return rankedEntries.slice(0, 8).map((entry) => {
      const primaryAlias = manifestEntryAliases(entry)[0] ?? entry.slug;

      return {
        id: entry.id,
        label: entry.title,
        insertValue: primaryAlias,
        detail: `${wikiEntryTypeLabel(entry)} - ${primaryAlias}`,
        kind: entry.kind,
      };
    });
  }, [currentManifestEntry, currentPageId, liveCurrentHeadings, manifest, wikiAutocompleteContext]);
  const mathAutocompleteSuggestions = useMemo(() => {
    if (!mathAutocompleteContext) {
      return [];
    }

    const query = mathAutocompleteContext.query.trim().toLowerCase();
    const startsWithMatches = mathAutocompleteItems.filter((item) =>
      item.trigger.startsWith(query),
    );
    const includesMatches = mathAutocompleteItems.filter(
      (item) =>
        !item.trigger.startsWith(query) &&
        (query.length === 0 ||
          item.trigger.includes(query) ||
          item.label.toLowerCase().includes(query)),
    );

    return [...startsWithMatches, ...includesMatches].slice(0, 8);
  }, [mathAutocompleteContext]);

  useEffect(() => {
    if (!isPreviewCollapsed && !isSourceCollapsed) {
      previewExpandedRatioRef.current = editorSplitRatio;
    }
  }, [editorSplitRatio, isPreviewCollapsed, isSourceCollapsed]);

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

  useEffect(() => {
    setPageMediaAssets(mediaAssets);
  }, [mediaAssets]);

  useEffect(() => {
    setActiveWikiAutocompleteIndex(0);
  }, [wikiAutocompleteContext?.query]);

  useEffect(() => {
    setActiveMathAutocompleteIndex(0);
  }, [mathAutocompleteContext?.query]);

  useEffect(() => {
    setRightPanelRoot(document.getElementById("editor-shell-right-panel-root"));
  }, []);

  useEffect(() => {
    const node = mathAutocompletePanelRef.current;
    if (!node || mathAutocompleteSuggestions.length === 0 || typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const typeset = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (cancelled) {
          return;
        }

        const mathJax = (window as Window & { MathJax?: MathJaxRuntime }).MathJax;
        if (mathJax?.typesetPromise) {
          if (mathJax.startup?.promise) {
            await mathJax.startup.promise.catch(() => undefined);
          }

          if (cancelled) {
            return;
          }

          mathJax.typesetClear?.([node]);
          await mathJax.typesetPromise([node]).catch(() => undefined);
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
    };

    void typeset();

    return () => {
      cancelled = true;
    };
  }, [mathAutocompleteSuggestions]);

  useEffect(() => {
    setEditorShortcuts(loadEditorShortcuts(shortcutScopeKey));

    const handleShortcutUpdate = (event: Event) => {
      const nextShortcuts = (event as CustomEvent<EditorShortcutMap>).detail;
      setEditorShortcuts(nextShortcuts);
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.endsWith(`.${shortcutScopeKey}`)) {
        return;
      }

      setEditorShortcuts(loadEditorShortcuts(shortcutScopeKey));
    };

    window.addEventListener(EDITOR_SHORTCUTS_UPDATED_EVENT, handleShortcutUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        EDITOR_SHORTCUTS_UPDATED_EVENT,
        handleShortcutUpdate,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [shortcutScopeKey]);

  useLayoutEffect(() => {
    const sourcePanel = sourcePanelRef.current;
    const previewPanel = previewPanelRef.current;
    const textarea = sourceRef.current;
    const previewViewport = previewViewportRef.current;

    if (!sourcePanel || !previewPanel || !textarea || !previewViewport) {
      return;
    }

    const updatePreviewOffset = () => {
      const sourceTop =
        textarea.getBoundingClientRect().top - sourcePanel.getBoundingClientRect().top;
      const previewTop =
        previewViewport.getBoundingClientRect().top - previewPanel.getBoundingClientRect().top;
      const nextOffset = Math.max(0, Math.round(sourceTop - previewTop));
      setPreviewOffset((current) => (current === nextOffset ? current : nextOffset));
    };

    updatePreviewOffset();

    const resizeObserver = new ResizeObserver(updatePreviewOffset);
    resizeObserver.observe(sourcePanel);
    resizeObserver.observe(previewPanel);
    resizeObserver.observe(textarea);
    resizeObserver.observe(previewViewport);
    window.addEventListener("resize", updatePreviewOffset);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePreviewOffset);
    };
  }, [fontPreset, isPreviewCollapsed, isSourceCollapsed]);

  const updateSplitFromClientX = (clientX: number) => {
    const container = editorSplitRef.current;
    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }

    const rawRatio = ((clientX - bounds.left) / bounds.width) * 100;
    if (rawRatio <= 4) {
      setEditorSplitRatio(0);
      return;
    }

    if (rawRatio >= 96) {
      setEditorSplitRatio(100);
      return;
    }

    setEditorSplitRatio(Math.max(18, Math.min(82, Math.round(rawRatio))));
  };

  useEffect(() => {
    if (!isDraggingSplit) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateSplitFromClientX(event.clientX);
    };

    const finishDragging = () => {
      setIsDraggingSplit(false);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDragging);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDragging);
    };
  }, [isDraggingSplit]);

  const payload = useMemo(
    () =>
      buildEditorSavePayload({
        mode,
        title,
        slug,
        body,
        status,
        featured,
        coverColor,
        allowExecution,
        summary,
        fontPreset,
        typography,
      }),
    [
      allowExecution,
      body,
      fontPreset,
      mode,
      slug,
      status,
      summary,
      title,
      typography,
      featured,
      coverColor,
    ],
  );
  const payloadSignature = useMemo(() => JSON.stringify(payload), [payload]);

  useEffect(() => {
    if (slugTouched) {
      return;
    }
    setSlug(toSlug(title));
  }, [slugTouched, title]);

  const postPreviewLine = useEffectEvent((line: number) => {
    const previewWindow = previewFrameRef.current?.contentWindow;
    if (!previewWindow) {
      return false;
    }

    previewWindow.postMessage(
      {
        type: "webbook-editor-preview-line",
        line,
      },
      window.location.origin,
    );
    return true;
  });

  const refreshPreview = useEffectEvent((mode: "debounced" | "immediate" = "immediate") => {
    if (typeof window === "undefined") {
      return;
    }

    previewSyncStateRef.current = beginPreviewReload(previewSyncStateRef.current);

    if (previewRefreshTimerRef.current !== null) {
      window.clearTimeout(previewRefreshTimerRef.current);
      previewRefreshTimerRef.current = null;
    }

    if (mode === "debounced") {
      previewRefreshTimerRef.current = window.setTimeout(() => {
        setPreviewVersion((current) => current + 1);
        previewRefreshTimerRef.current = null;
      }, 3000);
      return;
    }

    setPreviewVersion((current) => current + 1);
  });

  const applySaveResult = useEffectEvent((saved: SaveResponsePayload | null) => {
    const nextKind = saved?.kind ?? mode;
    const nextSlug = saved?.meta?.slug;
    const nextRoute = saved?.route ?? currentPublicRoute;
    const nextPageId = saved?.id ?? currentPageId;
    const nextChapterPath = saved?.path ?? [];
    const nextBookSlug =
      saved?.meta?.bookSlug ??
      (nextKind === "chapter" && nextRoute
        ? nextRoute.split("/").filter(Boolean)[1]
        : undefined);

    if (nextSlug) {
      setSlug(nextSlug);
    }
    if (saved?.id) {
      setCurrentPageId(saved.id);
    }
    if (nextRoute) {
      setCurrentPublicRoute(nextRoute);
    }

    let nextWorkspaceRoute: string | null = null;
    let nextEndpoint: string | null = null;
    let nextSourcePath: string | null = null;

    if (nextKind === "book" && nextSlug) {
      nextWorkspaceRoute = `/app/books/${nextSlug}`;
      nextEndpoint = `/api/books/${nextSlug}`;
      nextSourcePath = `content/books/${nextSlug}/book.md`;
    } else if (nextKind === "note" && nextSlug) {
      nextWorkspaceRoute = `/app/notes/${nextSlug}`;
      nextEndpoint = `/api/notes/${nextSlug}`;
      nextSourcePath = `content/notes/${nextSlug}.md`;
    } else if (nextKind === "chapter" && nextBookSlug && nextChapterPath.length > 0) {
      const joinedPath = nextChapterPath.join("/");
      nextWorkspaceRoute = `/app/books/${nextBookSlug}/chapters/${joinedPath}`;
      nextEndpoint = `/api/books/${nextBookSlug}/chapters/${joinedPath}`;
      nextSourcePath = `content/books/${nextBookSlug}/chapters/**/${nextChapterPath.at(-1)}.md`;
    }

    const needsRebind =
      nextPageId !== currentPageId ||
      nextRoute !== currentPublicRoute ||
      nextEndpoint !== currentUpdateEndpoint ||
      nextSourcePath !== currentPath;

    if (nextEndpoint) {
      setCurrentUpdateEndpoint(nextEndpoint);
    }
    if (nextSourcePath) {
      setCurrentPath(nextSourcePath);
    }
    if (needsRebind && nextWorkspaceRoute) {
      router.replace(nextWorkspaceRoute);
      router.refresh();
      refreshPreview("immediate");
    }
  });

  useEffect(
    () => () => {
      if (previewRefreshTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(previewRefreshTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (payloadSignature === lastSavedPayloadSignatureRef.current) {
      return;
    }

    const timer = setTimeout(async () => {
      setSaveState("saving");
      setSaveMessage("Autosaving...");
      try {
        const response = await fetch(currentUpdateEndpoint, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Autosave failed");
        }

        applySaveResult((await response.json().catch(() => null)) as SaveResponsePayload | null);
        lastSavedPayloadSignatureRef.current = payloadSignature;

        setSaveState("saved");
        setSaveMessage("Autosaved");
        refreshPreview("debounced");
      } catch {
        setSaveState("error");
        setSaveMessage("Autosave failed");
      }
    }, 1400);

    return () => clearTimeout(timer);
  }, [applySaveResult, currentUpdateEndpoint, payload, payloadSignature, refreshPreview]);

  useLayoutEffect(() => {
    const textarea = sourceRef.current;
    const pendingSelection = pendingSelectionRef.current;
    if (!textarea || !pendingSelection) {
      return;
    }

    textarea.focus();
    textarea.setSelectionRange(pendingSelection.start, pendingSelection.end);
    textarea.scrollTop = pendingSelection.scrollTop;
    textarea.scrollLeft = pendingSelection.scrollLeft;
    rememberSourceViewport(textarea);
    pendingSelectionRef.current = null;
  }, [body]);

  const manualSave = async () => {
    setSaveState("saving");
    setSaveMessage("Saving snapshot...");
    const response = await fetch(currentUpdateEndpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        createRevision: true,
      }),
    });

    if (!response.ok) {
      setSaveState("error");
      setSaveMessage("Snapshot save failed");
      return;
    }

    applySaveResult((await response.json().catch(() => null)) as SaveResponsePayload | null);
    lastSavedPayloadSignatureRef.current = payloadSignature;

    setSaveState("saved");
    setSaveMessage("Snapshot saved");
    refreshPreview("immediate");
  };

  const saveTypography = async () => {
    setSaveState("saving");
    setSaveMessage("Saving typography...");
    const response = await fetch(currentUpdateEndpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setSaveState("error");
      setSaveMessage("Typography save failed");
      return;
    }

    applySaveResult((await response.json().catch(() => null)) as SaveResponsePayload | null);
    lastSavedPayloadSignatureRef.current = payloadSignature;

    setSaveState("saved");
    setSaveMessage("Typography saved");
    refreshPreview("immediate");
  };

  const togglePublication = (nextPublished: boolean) => {
    startTransition(async () => {
      const endpoint = nextPublished ? "/api/publish" : "/api/unpublish";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: currentPageId }),
      });

      if (!response.ok) {
        setSaveState("error");
        setSaveMessage(nextPublished ? "Publish failed" : "Unpublish failed");
        return;
      }

      applySaveResult((await response.json().catch(() => null)) as SaveResponsePayload | null);
      lastSavedPayloadSignatureRef.current = JSON.stringify({
        ...payload,
        status: nextPublished ? "published" : "draft",
      } satisfies EditorSavePayload);
      setStatus(nextPublished ? "published" : "draft");
      setSaveState("saved");
      setSaveMessage(nextPublished ? "Published" : "Moved to draft");
      refreshPreview("immediate");
    });
  };

  const updateTypography = <K extends keyof BookTypography>(
    key: K,
    value: BookTypography[K],
  ) => {
    setTypography((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const rememberSourceViewport = (textarea: HTMLTextAreaElement) => {
    sourceViewportRef.current = {
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    };
  };

  const commitBody = (
    nextBody: string,
    selection: {
      start: number;
      end: number;
      scrollTop: number;
      scrollLeft: number;
    },
  ) => {
    pendingSelectionRef.current = selection;
    setBody(nextBody);

    const currentSnapshot = historyRef.current[historyIndexRef.current];
    if (currentSnapshot?.body === nextBody) {
      historyRef.current[historyIndexRef.current] = {
        body: nextBody,
        selectionStart: selection.start,
        selectionEnd: selection.end,
        scrollTop: selection.scrollTop,
        scrollLeft: selection.scrollLeft,
      };
      return;
    }

    const nextSnapshot: EditorSnapshot = {
      body: nextBody,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      scrollTop: selection.scrollTop,
      scrollLeft: selection.scrollLeft,
    };

    const nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
    nextHistory.push(nextSnapshot);
    historyRef.current = nextHistory.slice(-200);
    historyIndexRef.current = historyRef.current.length - 1;
  };

  const restoreHistorySnapshot = (snapshot: EditorSnapshot) => {
    pendingSelectionRef.current = {
      start: snapshot.selectionStart,
      end: snapshot.selectionEnd,
      scrollTop: snapshot.scrollTop,
      scrollLeft: snapshot.scrollLeft,
    };
    setBody(snapshot.body);
  };

  const applyMarkdown = (
    transform: (selectedText: string) => {
      nextSelection: string;
      replacement: string;
      selectionOffsetStart?: number;
      selectionOffsetEnd?: number;
    },
  ) => {
    const textarea = sourceRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.slice(start, end);
    const {
      nextSelection,
      replacement,
      selectionOffsetStart = 0,
      selectionOffsetEnd = 0,
    } = transform(selectedText);
    const nextBody = `${body.slice(0, start)}${replacement}${body.slice(end)}`;

    const selectionStart = start + selectionOffsetStart;
    const selectionEnd = selectionStart + nextSelection.length + selectionOffsetEnd;
    commitBody(nextBody, {
      start: selectionStart,
      end: selectionEnd,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    });
  };

  const insertMarkdownAtRange = (
    replacement: string,
    selection: {
      start: number;
      end: number;
      scrollTop: number;
      scrollLeft: number;
    },
  ) => {
    const nextBody =
      `${bodyRef.current.slice(0, selection.start)}${replacement}` +
      `${bodyRef.current.slice(selection.end)}`;
    const caret = selection.start + replacement.length;
    commitBody(nextBody, {
      start: caret,
      end: caret,
      scrollTop: selection.scrollTop,
      scrollLeft: selection.scrollLeft,
    });
  };

  const syncAutocomplete = (content: string, caretOffset: number) => {
    const nextWikiContext = detectWikiAutocompleteContext(content, caretOffset);
    setWikiAutocompleteContext(nextWikiContext);

    if (nextWikiContext) {
      setMathAutocompleteContext(null);
      return;
    }

    setMathAutocompleteContext(detectMathAutocompleteContext(content, caretOffset));
  };

  const handleDelimiterKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return false;
    }

    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const hasSelection = start !== end;
    const currentBody = bodyRef.current;
    const key = event.key;

    if (key in pairedDelimiters) {
      const opening = key as keyof typeof pairedDelimiters;
      const closing = pairedDelimiters[opening];
      const selectedText = currentBody.slice(start, end);
      const nextBody =
        `${currentBody.slice(0, start)}${opening}${selectedText}${closing}` +
        `${currentBody.slice(end)}`;

      event.preventDefault();
      commitBody(nextBody, {
        start: start + 1,
        end: hasSelection ? end + 1 : start + 1,
        scrollTop: textarea.scrollTop,
        scrollLeft: textarea.scrollLeft,
      });
      syncAutocomplete(nextBody, start + 1);
      return true;
    }

    if (
      closingDelimiters.has(key) &&
      !hasSelection &&
      currentBody[start] === key
    ) {
      event.preventDefault();
      textarea.setSelectionRange(start + 1, start + 1);
      rememberSourceViewport(textarea);
      syncAutocomplete(currentBody, start + 1);
      return true;
    }

    if (key === "Backspace" && !hasSelection && start > 0) {
      const previousChar = currentBody[start - 1];
      const nextChar = currentBody[start];
      const matchingClosing =
        pairedDelimiters[previousChar as keyof typeof pairedDelimiters];

      if (matchingClosing && matchingClosing === nextChar) {
        event.preventDefault();
        const nextBody =
          `${currentBody.slice(0, start - 1)}${currentBody.slice(start + 1)}`;
        commitBody(nextBody, {
          start: start - 1,
          end: start - 1,
          scrollTop: textarea.scrollTop,
          scrollLeft: textarea.scrollLeft,
        });
        syncAutocomplete(nextBody, start - 1);
        return true;
      }
    }

    return false;
  };

  const sourceOffsetFromLine = (content: string, line: number) => {
    if (line <= 1) {
      return 0;
    }

    let currentLine = 1;
    for (let index = 0; index < content.length; index += 1) {
      if (currentLine === line) {
        return index;
      }

      if (content[index] === "\n") {
        currentLine += 1;
      }
    }

    return content.length;
  };

  const sourceLineFromOffset = (content: string, offset: number) => {
    let line = 1;
    for (let index = 0; index < Math.min(offset, content.length); index += 1) {
      if (content[index] === "\n") {
        line += 1;
      }
    }

    return line;
  };

  const focusSourceLine = useEffectEvent((line: number) => {
    const textarea = sourceRef.current;
    if (!textarea) {
      return;
    }

    const normalizedLine = Math.max(1, line - 1);
    const offset = sourceOffsetFromLine(bodyRef.current, normalizedLine);
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 28;
    const scrollTop = Math.max(0, (normalizedLine - 2) * lineHeight);

    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = scrollTop;
    textarea.scrollLeft = 0;
    rememberSourceViewport(textarea);
  });

  const togglePreviewPanel = () => {
    if (isPreviewCollapsed) {
      const nextRatio = Math.max(18, Math.min(82, previewExpandedRatioRef.current || 52));
      setEditorSplitRatio(nextRatio);
      return;
    }

    if (!isSourceCollapsed) {
      previewExpandedRatioRef.current = editorSplitRatio;
    }
    setEditorSplitRatio(100);
  };

  const revealCurrentSourceInPreview = () => {
    const textarea = sourceRef.current;
    if (!textarea) {
      return;
    }

    const line = sourceLineFromOffset(bodyRef.current, textarea.selectionStart);
    previewSyncStateRef.current = setPreviewAnchorLine(previewSyncStateRef.current, line);
    if (!postPreviewLine(line)) {
      previewSyncStateRef.current = beginPreviewReload(previewSyncStateRef.current);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object" || typeof data.type !== "string") {
        return;
      }

      if (data.type === "webbook-preview-source-line" && typeof data.line === "number") {
        previewSyncStateRef.current = setRenderedPreviewLine(
          previewSyncStateRef.current,
          data.line,
        );
        focusSourceLine(data.line);
        return;
      }

      if (data.type === "webbook-preview-visible-line" && typeof data.line === "number") {
        const update = applyPreviewVisibleLineUpdate(
          previewSyncStateRef.current,
          data.line,
        );
        previewSyncStateRef.current = update.nextState;
        if (update.restoreLineToSend !== null) {
          postPreviewLine(update.restoreLineToSend);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const uploadImageAndInsert = async (
    file: File,
    selection?: {
      start: number;
      end: number;
      scrollTop: number;
      scrollLeft: number;
    },
  ) => {
    const textarea = sourceRef.current;
    if (!textarea) {
      return;
    }

    const targetSelection = selection ?? {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    };

    setImageUploadPending(true);
    setSaveState("saving");
    setSaveMessage("Uploading image...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/uploads/image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Image upload failed");
      }

      const payload = (await response.json()) as ImageUploadPayload;
      const markdown = `\n![${payload.alt}](${payload.url})\n`;
      insertMarkdownAtRange(markdown, targetSelection);
      setSaveState("saved");
      setSaveMessage("Image uploaded");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Image upload failed",
      );
    } finally {
      setImageUploadPending(false);
    }
  };

  const promptUploadTargetPath = () => {
    const input = window.prompt(
      "Folder inside /media for this upload.",
      uploadBasePath,
    );

    if (input === null) {
      return null;
    }

    const normalizedInput = input.trim().replace(/^\/+|\/+$/g, "");
    return normalizedInput || uploadBasePath;
  };

  const uploadFileAsset = async (file: File, targetPath: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (targetPath) {
      formData.append("targetPath", targetPath);
    }

    const response = await fetch("/api/uploads/file", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? "File upload failed");
    }

    return (await response.json()) as FileUploadPayload;
  };

  const uploadFilesAndInsert = async (
    files: File[],
    selection?: {
      start: number;
      end: number;
      scrollTop: number;
      scrollLeft: number;
    },
  ) => {
    const textarea = sourceRef.current;
    if (!textarea || files.length === 0) {
      return;
    }

    const targetSelection = selection ?? {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    };
    const targetPath = promptUploadTargetPath();
    if (targetPath === null) {
      return;
    }

    setFileUploadPending(true);
    setSaveState("saving");
    setSaveMessage(files.length > 1 ? "Uploading files..." : "Uploading file...");

    try {
      const uploadedFiles = await Promise.all(
        files.map((file) => uploadFileAsset(file, targetPath)),
      );
      const markdown =
        uploadedFiles.length === 1
          ? `\n[${uploadedFiles[0].originalName}](${uploadedFiles[0].url})\n`
          : `\n${uploadedFiles
              .map((item) => `- [${item.originalName}](${item.url})`)
              .join("\n")}\n`;
      insertMarkdownAtRange(markdown, targetSelection);
      setSaveState("saved");
      setSaveMessage(uploadedFiles.length > 1 ? "Files uploaded" : "File uploaded");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "File upload failed",
      );
    } finally {
      setFileUploadPending(false);
    }
  };

  const uploadFolderArchiveAndInsert = async (
    files: File[],
    selection?: {
      start: number;
      end: number;
      scrollTop: number;
      scrollLeft: number;
    },
  ) => {
    const textarea = sourceRef.current;
    if (!textarea || files.length === 0) {
      return;
    }

    const targetSelection = selection ?? {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    };
    const targetPath = promptUploadTargetPath();
    if (targetPath === null) {
      return;
    }

    setFileUploadPending(true);
    setSaveState("saving");
    setSaveMessage("Compressing folder...");

    try {
      const zip = new JSZip();
      const firstRelativePath =
        (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? files[0].name;
      const folderName = firstRelativePath.split("/")[0] || "folder";

      await Promise.all(
        files.map(async (file) => {
          const relativePath =
            (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name;
          zip.file(relativePath, await file.arrayBuffer());
        }),
      );

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const archiveFile = new File([zipBlob], `${folderName}.zip`, {
        type: "application/zip",
      });

      setSaveMessage("Uploading folder archive...");
      const uploadedFile = await uploadFileAsset(archiveFile, targetPath);
      const markdown = `\n[${uploadedFile.originalName}](${uploadedFile.url})\n`;
      insertMarkdownAtRange(markdown, targetSelection);
      setSaveState("saved");
      setSaveMessage("Folder archive uploaded");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Folder upload failed",
      );
    } finally {
      setFileUploadPending(false);
    }
  };

  const wrapAlignedBlock = (alignment: "left" | "center" | "right") => {
    applyMarkdown((selectedText) => {
      const nextSelection = selectedText || "Aligned content";
      const prefix = `\n:::align-${alignment}\n`;
      return {
        nextSelection,
        replacement: `${prefix}${nextSelection}\n:::\n`,
        selectionOffsetStart: prefix.length,
      };
    });
  };

  const insertMediaLayoutBlock = (layout: "left" | "right" | "split") => {
    applyMarkdown((selectedText) => {
      const textContent = selectedText || "Write your text here.";
      if (layout === "left") {
        const replacement = `\n:::media-left width=38%\n![Image](/media/path){width=100%}\n---\n${textContent}\n:::\n`;
        return {
          nextSelection: textContent,
          replacement,
          selectionOffsetStart: replacement.indexOf(textContent),
        };
      }

      if (layout === "right") {
        const replacement = `\n:::media-right width=38%\n${textContent}\n---\n![Image](/media/path){width=100%}\n:::\n`;
        return {
          nextSelection: textContent,
          replacement,
          selectionOffsetStart: replacement.indexOf(textContent),
        };
      }

      const replacement = `\n:::media-split left=45% right=55%\n![Image](/media/path){width=100%}\n---\n${textContent}\n:::\n`;
      return {
        nextSelection: textContent,
        replacement,
        selectionOffsetStart: replacement.indexOf(textContent),
      };
    });
  };

  const insertCodeBlock = () => {
    const language = window.prompt(
      "Code block language. Use `python exec id=my-cell` for runnable Python.",
      "python",
    );

    if (language === null) {
      return;
    }

    const normalizedLanguage = language.trim() || "text";
    applyMarkdown((selectedText) => {
      const nextSelection = selectedText || 'print("Hello, WebBook")';
      const prefix = `\n\`\`\`${normalizedLanguage}\n`;
      return {
        nextSelection,
        replacement: `${prefix}${nextSelection}\n\`\`\`\n`,
        selectionOffsetStart: prefix.length,
      };
    });
  };

  const applyInlineTextStyle = () => {
    applyMarkdown((selectedText) => {
      const nextSelection = selectedText || "styled text";
      const href = buildInlineTextStyleHref({
        color: inlineTextColor,
        size: inlineTextSize,
      });

      return {
        nextSelection,
        replacement: `[${nextSelection}](${href})`,
        selectionOffsetStart: 1,
      };
    });
  };

  const applyList = (ordered: boolean) => {
    applyMarkdown((selectedText) => {
      const content = selectedText || "List item";
      const lines = content.split("\n");
      const formattedLines = lines.map((line, index) => {
        if (!line.trim()) {
          return "";
        }

        return ordered ? `${index + 1}. ${line}` : `- ${line}`;
      });
      const replacement = formattedLines.join("\n");
      const firstPrefixLength = ordered ? 3 : 2;

      return {
        nextSelection: content,
        replacement,
        selectionOffsetStart: firstPrefixLength,
      };
    });
  };

  const applyBold = () =>
    applyMarkdown((selectedText) => {
      const nextSelection = selectedText || "bold text";
      return {
        nextSelection,
        replacement: `**${nextSelection}**`,
        selectionOffsetStart: 2,
      };
    });

  const applyItalic = () =>
    applyMarkdown((selectedText) => {
      const nextSelection = selectedText || "italic text";
      return {
        nextSelection,
        replacement: `*${nextSelection}*`,
        selectionOffsetStart: 1,
      };
    });

  const applyInlineMath = () =>
    applyMarkdown((selectedText) => {
      const nextSelection = selectedText;
      return {
        nextSelection,
        replacement: `$${nextSelection}$`,
        selectionOffsetStart: 1,
      };
    });

  const applyBlockMath = () =>
    applyMarkdown((selectedText) => {
      const nextSelection = selectedText;
      return {
        nextSelection,
        replacement: `\n$$\n${nextSelection}\n$$\n`,
        selectionOffsetStart: 4,
      };
    });

  const undoEditor = () => {
    if (historyIndexRef.current === 0) {
      return;
    }

    historyIndexRef.current -= 1;
    restoreHistorySnapshot(historyRef.current[historyIndexRef.current]);
  };

  const redoEditor = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      return;
    }

    historyIndexRef.current += 1;
    restoreHistorySnapshot(historyRef.current[historyIndexRef.current]);
  };

  const runShortcutAction = (actionId: ShortcutActionId) => {
    switch (actionId) {
      case "bold":
        applyBold();
        break;
      case "italic":
        applyItalic();
        break;
      case "inlineMath":
        applyInlineMath();
        break;
      case "blockMath":
        applyBlockMath();
        break;
      case "image":
        fileInputRef.current?.click();
        break;
      case "undo":
        undoEditor();
        break;
      case "redo":
        redoEditor();
        break;
      default:
        break;
    }
  };

  const applyMathAutocompleteItem = (item: MathAutocompleteItem) => {
    const textarea = sourceRef.current;
    const context = mathAutocompleteContext;
    if (!textarea || !context) {
      return;
    }

    const nextBody =
      `${bodyRef.current.slice(0, context.start)}${item.insertValue}` +
      `${bodyRef.current.slice(context.end)}`;
    const caret = context.start + item.caretOffset;
    commitBody(nextBody, {
      start: caret,
      end: caret,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    });
    setMathAutocompleteContext(null);
    setWikiAutocompleteContext(null);
  };

  const applyWikiAutocompleteItem = (item: WikiAutocompleteItem) => {
    const textarea = sourceRef.current;
    const context = wikiAutocompleteContext;
    if (!textarea || !context) {
      return;
    }

    const closingSuffix = bodyRef.current.slice(context.end).startsWith("]]") ? "" : "]]";
    const nextBody =
      `${bodyRef.current.slice(0, context.start)}${item.insertValue}${closingSuffix}` +
      `${bodyRef.current.slice(context.end)}`;
    const caret = context.start + item.insertValue.length + closingSuffix.length;
    commitBody(nextBody, {
      start: caret,
      end: caret,
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
    });
    setWikiAutocompleteContext(null);
    setMathAutocompleteContext(null);
  };

  const formatFileSize = (size: number | null) => {
    if (size === null) {
      return "Unknown size";
    }

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatMediaUpdatedAt = (value: string | null) => {
    if (!value) {
      return "unknown date";
    }

    return formatRelativeDate(value);
  };

  const copyMediaLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setSaveState("saved");
      setSaveMessage("Media link copied");
    } catch {
      setSaveState("error");
      setSaveMessage("Could not copy media link");
    }
  };

  const deleteMediaAsset = async (asset: MediaAsset, force = false) => {
    if (asset.missing) {
      setSaveState("error");
      setSaveMessage("Cannot delete missing media file");
      return;
    }

    const actionLabel = force ? "force delete" : "delete";
    const confirmed = window.confirm(
      force
        ? `Force delete ${asset.name}? It is still referenced in content.`
        : `Move ${asset.name} to trash?`,
    );
    if (!confirmed) {
      return;
    }

    setSaveState("saving");
    setSaveMessage(`Preparing media ${actionLabel}...`);

    const response = await fetch("/api/media", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: asset.url,
        force,
      }),
    });

    if (response.status === 409) {
      const payload = (await response.json()) as { references?: Array<{ title: string }> };
      setSaveState("error");
      setSaveMessage(
        payload.references?.length
          ? `${asset.name} is still referenced`
          : "Media delete blocked",
      );
      return;
    }

    if (!response.ok) {
      setSaveState("error");
      setSaveMessage("Media delete failed");
      return;
    }

    setPageMediaAssets((current) =>
      current.filter((currentAsset) => currentAsset.url !== asset.url),
    );
    setSaveState("saved");
    setSaveMessage("Media moved to trash");
  };

  const renameMediaAsset = async (asset: MediaAsset) => {
    if (asset.missing) {
      setSaveState("error");
      setSaveMessage("Cannot rename missing media file");
      return;
    }

    const { baseName } = splitMediaName(asset.name);
    const requestedName = window.prompt("New media name (base name only)", baseName);
    if (requestedName === null) {
      return;
    }

    const trimmed = requestedName.trim();
    if (!trimmed) {
      setSaveState("error");
      setSaveMessage("Media rename cancelled: empty name");
      return;
    }

    setMediaRenamePendingUrl(asset.url);
    setSaveState("saving");
    setSaveMessage("Renaming media...");

    try {
      const response = await fetch("/api/media", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: asset.url,
          newBaseName: trimmed,
          rewriteReferences: true,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            oldUrl?: string;
            newUrl?: string;
            updatedReferences?: number;
          }
        | null;

      if (!response.ok || !payload?.newUrl) {
        setSaveState("error");
        setSaveMessage(payload?.error ?? "Media rename failed");
        return;
      }

      const nextRelativePath = mediaRelativePathFromUrl(payload.newUrl);
      const nextName = nextRelativePath ? nextRelativePath.split("/").at(-1) ?? asset.name : asset.name;
      const nextFolder = nextRelativePath ? nextRelativePath.split("/").slice(0, -1).join("/") || "." : asset.folder;

      setPageMediaAssets((current) =>
        current.map((currentAsset) =>
          currentAsset.url === asset.url
            ? {
                ...currentAsset,
                name: nextName,
                url: payload.newUrl as string,
                relativePath: nextRelativePath ?? currentAsset.relativePath,
                folder: nextFolder,
              }
            : currentAsset,
        ),
      );
      const oldUrl = payload.oldUrl ?? asset.url;
      setBody((currentBody) => currentBody.replaceAll(oldUrl, payload.newUrl as string));
      setSaveState("saved");
      setSaveMessage(
        `Media renamed. Updated ${payload.updatedReferences ?? 0} link${(payload.updatedReferences ?? 0) === 1 ? "" : "s"}.`,
      );
    } catch {
      setSaveState("error");
      setSaveMessage("Media rename failed");
    } finally {
      setMediaRenamePendingUrl(null);
    }
  };

  const toolbarActions: Array<{
    id: string;
    label: string;
    title: string;
    icon: React.ReactNode;
    run: () => void;
  }> = [
    {
      id: "bold",
      label: "Bold",
      title: "Bold",
      icon: <Bold className="h-4 w-4" />,
      run: applyBold,
    },
    {
      id: "italic",
      label: "Italic",
      title: "Italic",
      icon: <Italic className="h-4 w-4" />,
      run: applyItalic,
    },
    {
      id: "inline-math",
      label: "Inline math",
      title: "Inline math",
      icon: <Sigma className="h-4 w-4" />,
      run: applyInlineMath,
    },
    {
      id: "block-math",
      label: "Block equation",
      title: "Block equation",
      icon: <span className="text-[10px] font-semibold leading-none">$$</span>,
      run: applyBlockMath,
    },
    {
      id: "bullet-list",
      label: "Bulleted list",
      title: "Bulleted list",
      icon: <List className="h-4 w-4" />,
      run: () => applyList(false),
    },
    {
      id: "numbered-list",
      label: "Numbered list",
      title: "Numbered list",
      icon: <ListOrdered className="h-4 w-4" />,
      run: () => applyList(true),
    },
    {
      id: "code-block",
      label: "Code block",
      title: "Code block",
      icon: <Code2 className="h-4 w-4" />,
      run: insertCodeBlock,
    },
    {
      id: "align-left",
      label: "Align left",
      title: "Align left",
      icon: <AlignLeft className="h-4 w-4" />,
      run: () => wrapAlignedBlock("left"),
    },
    {
      id: "align-center",
      label: "Align center",
      title: "Align center",
      icon: <AlignCenter className="h-4 w-4" />,
      run: () => wrapAlignedBlock("center"),
    },
    {
      id: "align-right",
      label: "Align right",
      title: "Align right",
      icon: <AlignRight className="h-4 w-4" />,
      run: () => wrapAlignedBlock("right"),
    },
    {
      id: "media-left",
      label: "Media left",
      title: "Media left",
      icon: <PanelLeft className="h-4 w-4" />,
      run: () => insertMediaLayoutBlock("left"),
    },
    {
      id: "media-right",
      label: "Media right",
      title: "Media right",
      icon: <PanelRight className="h-4 w-4" />,
      run: () => insertMediaLayoutBlock("right"),
    },
    {
      id: "media-split",
      label: "Media split",
      title: "Media split",
      icon: <Columns2 className="h-4 w-4" />,
      run: () => insertMediaLayoutBlock("split"),
    },
    {
      id: "image",
      label: "Insert image",
      title: "Insert image",
      icon: <ImagePlus className="h-4 w-4" />,
      run: () => fileInputRef.current?.click(),
    },
    {
      id: "upload-file",
      label: "Upload file",
      title: "Upload file",
      icon: <CloudUpload className="h-4 w-4" />,
      run: () => uploadFileInputRef.current?.click(),
    },
    {
      id: "upload-folder",
      label: "Upload folder as zip",
      title: "Upload folder as zip",
      icon: <FolderOpen className="h-4 w-4" />,
      run: () => uploadFolderInputRef.current?.click(),
    },
    {
      id: "youtube",
      label: "YouTube embed",
      title: "YouTube embed",
      icon: <Youtube className="h-4 w-4" />,
      run: () => {
        const input = window.prompt(
          "Paste a YouTube link or iframe embed code",
          "https://www.youtube.com/watch?v=VIDEO_ID",
        );
        if (!input) {
          return;
        }

        const normalized = normalizeYouTubeEmbedInput(input);
        if (!normalized) {
          setSaveState("error");
          setSaveMessage("Invalid YouTube embed");
          return;
        }

        applyMarkdown(() => ({
          nextSelection: normalized,
          replacement: `\n${normalized}\n`,
          selectionOffsetStart: 1,
        }));
      },
    },
  ];

  const inspectorContent = (
    <>
      {extraActions}

      <div
        className="editor-inspector-card border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
        style={workspacePanelStyle}
      >
        <p className="paper-label">Page settings</p>
        <div className="grid gap-4">
          <div>
            <label className="paper-label" htmlFor={`${pageId}-title`}>
              Title
            </label>
            <input
              id={`${pageId}-title`}
              className="paper-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <label className="paper-label" htmlFor={`${pageId}-slug`}>
              Slug
            </label>
            <input
              id={`${pageId}-slug`}
              className="paper-input"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
            />
          </div>
          <div>
            <label className="paper-label" htmlFor={`${pageId}-summary`}>
              {mode === "book" ? "Description" : "Summary"}
            </label>
            <input
              id={`${pageId}-summary`}
              className="paper-input"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
          <div>
            <label className="paper-label" htmlFor={`${pageId}-font-preset`}>
              Page font
            </label>
            <select
              id={`${pageId}-font-preset`}
              className="paper-select"
              value={fontPreset}
              onChange={(event) => setFontPreset(event.target.value as FontPreset)}
            >
              {fontPresetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {mode !== "book" ? (
            <label className="flex items-center gap-3 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.5)] px-4 py-3">
              <input
                type="checkbox"
                checked={allowExecution}
                onChange={(event) => setAllowExecution(event.target.checked)}
              />
              <span className="text-sm text-[var(--paper-muted)]">
                Allow Python execution on the public page
              </span>
            </label>
          ) : null}
        </div>
      </div>

      {mode === "book" ? (
        <div
          className="editor-inspector-card border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
          style={workspacePanelStyle}
        >
          <p className="paper-label">Landing page</p>
          <label className="flex items-center gap-3 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.5)] px-4 py-3">
            <input
              type="checkbox"
              checked={featured}
              onChange={(event) => setFeatured(event.target.checked)}
            />
            <span className="text-sm text-[var(--paper-muted)]">
              Mark this book as featured on the landing page. Up to 3 books can stay featured.
            </span>
          </label>
        </div>
      ) : null}

      <div
        className="editor-inspector-card border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
        style={workspacePanelStyle}
      >
        <p className="paper-label">Context</p>
        <div className="grid gap-3">
          <div className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--paper-muted)]">Path</p>
            <p className="mt-1 break-words text-sm font-medium">{currentPath}</p>
          </div>
          {currentPublicRoute ? (
            <Link
              href={currentPublicRoute}
              className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-3 text-sm text-[var(--paper-muted)] transition hover:text-[var(--paper-ink)] break-words"
            >
              Public route: {currentPublicRoute}
            </Link>
          ) : null}
        </div>
      </div>
      {false ? (
      <div
        className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
        style={workspacePanelStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="paper-label mb-0">Media</p>
            <p className="text-sm text-[var(--paper-muted)]">
              Files stored for this {mode} under its media folder. Deletes move assets to trash.
            </p>
          </div>
          <button
            type="button"
            className="paper-button paper-button-secondary flex items-center gap-2 px-3 py-2 text-sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="grid gap-3">
          {pageMediaAssets.length ? (
            pageMediaAssets.map((asset) => (
              <div
                key={asset.url}
                className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--paper-ink)]">
                      {asset.name}
                    </p>
                    <p className="truncate text-xs text-[var(--paper-muted)]">
                      {asset.relativePath ?? asset.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="Copy media link"
                      aria-label="Copy media link"
                      onClick={() => void copyMediaLink(asset.url)}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="panel-icon-button"
                      title="Open media file"
                      aria-label="Open media file"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      className="panel-icon-button text-[var(--paper-danger)]"
                      title={asset.references.length ? "Force delete media" : "Delete media"}
                      aria-label={asset.references.length ? "Force delete media" : "Delete media"}
                      onClick={() => void deleteMediaAsset(asset, asset.references.length > 0)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-1 text-xs text-[var(--paper-muted)]">
                  <p>
                    {formatFileSize(asset.size)} · updated {formatMediaUpdatedAt(asset.modifiedAt)}
                  </p>
                  {asset.references.length ? (
                    <div className="rounded-[14px] border border-[rgba(188,128,53,0.2)] bg-[rgba(188,128,53,0.08)] px-2.5 py-2">
                      <p className="font-medium text-[color:var(--paper-accent)]">
                        Referenced in {asset.references.length} page
                        {asset.references.length === 1 ? "" : "s"}
                      </p>
                      <div className="mt-1 grid gap-1">
                        {asset.references.slice(0, 4).map((reference) => (
                          <Link
                            key={reference.id}
                            href={reference.route}
                            className="truncate text-[var(--paper-muted)] transition hover:text-[var(--paper-ink)]"
                          >
                            {reference.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p>No references detected.</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--paper-muted)]">
              No media uploaded for this {mode} yet.
            </p>
          )}
        </div>
      </div>
      ) : null}

      <div
        className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
        style={workspacePanelStyle}
      >
        <p className="paper-label">Outline</p>
        <div className="toc-list">
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="paper-nav-link"
              style={{ paddingLeft: `${Math.max(item.depth - 1, 0) * 12 + 12}px` }}
            >
              {item.value}
            </a>
          ))}
        </div>
      </div>

      <div
        className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
        style={workspacePanelStyle}
      >
        <p className="paper-label">Backlinks</p>
        <div className="grid gap-2">
          {backlinks.length ? (
            backlinks.map((entry) => (
              <Link key={entry.id} href={entry.route} className="paper-nav-link">
                {entry.title}
              </Link>
            ))
          ) : (
            <p className="text-sm text-[var(--paper-muted)]">No backlinks yet.</p>
          )}
        </div>
      </div>

      <div
        className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
        style={workspacePanelStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="paper-label mb-0">Link health</p>
          <button
            type="button"
            className="paper-button paper-button-secondary flex items-center gap-2 px-3 py-2 text-sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="grid gap-2">
          {unresolvedLinks.length ? (
            unresolvedLinks.map((link) => (
              <div
                key={link}
                className="rounded-[18px] border border-[rgba(145,47,47,0.2)] bg-[rgba(145,47,47,0.08)] px-3 py-2 text-sm text-[var(--paper-danger)]"
              >
                [[{link}]]
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 rounded-[18px] border border-[rgba(49,87,58,0.16)] bg-[rgba(49,87,58,0.09)] px-3 py-2 text-sm text-[var(--paper-success)]">
              <CheckCircle2 className="h-4 w-4" />
              All wiki links resolve.
            </div>
          )}
        </div>
      </div>

      {revisions.length ? (
        <div
          className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
          style={workspacePanelStyle}
        >
          <p className="paper-label">Recent revisions</p>
          <div className="grid gap-2">
            {revisions.slice(0, 8).map((revision) => (
              <div
                key={revision}
                className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] px-3 py-2 text-xs text-[var(--paper-muted)]"
              >
                {revision}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );

  const renderTypographyPanel = ({
    title,
    description,
    open = false,
    defaultTypography = defaultBookTypography,
  }: {
    title: string;
    description: string;
    open?: boolean;
    defaultTypography?: BookTypography;
    }) => (
      (() => {
        const renderTypographyControl = <K extends keyof BookTypography>({
          keyName,
          label,
          description,
          inputId,
          fallback,
          format = (value: number) => String(value),
        }: {
          keyName: K;
          label: string;
          description: string;
          inputId: string;
          fallback: number;
          format?: (value: number) => string;
        }) => {
          const limits = bookTypographyLimits[keyName];
          const value = typography[keyName] as number;

          return (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="paper-label mb-0" htmlFor={inputId}>
                  {label}
                </label>
                <span className="text-sm text-[var(--paper-muted)]">{format(value)}</span>
              </div>
              <p className="text-sm leading-6 text-[var(--paper-muted)]">{description}</p>
              <input
                id={inputId}
                type="range"
                min={limits.min}
                max={limits.max}
                step={limits.step}
                value={value}
                onChange={(event) =>
                  updateTypography(
                    keyName,
                    (Number(event.target.value) || fallback) as BookTypography[K],
                  )
                }
              />
              <input
                className="paper-input"
                type="number"
                min={limits.min}
                max={limits.max}
                step={limits.step}
                value={value}
                onChange={(event) =>
                  updateTypography(
                    keyName,
                    (Number(event.target.value) || fallback) as BookTypography[K],
                  )
                }
              />
            </div>
          );
        };

        return (
      <details
        className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-5"
        style={workspacePanelStyle}
      open={open}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="paper-label mb-1">{title}</p>
          <p className="text-sm text-[var(--paper-muted)]">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="paper-button paper-button-secondary px-3 py-2 text-sm"
            onClick={(event) => {
              event.preventDefault();
              void saveTypography();
            }}
          >
            Save typography
          </button>
          <ChevronDown className="h-4 w-4 text-[var(--paper-muted)]" />
        </div>
      </summary>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {renderTypographyControl({
            keyName: "bodyFontSize",
            label: "Body font size",
            description: "Sets the base size used for paragraph text across the page.",
            inputId: `${pageId}-body-font-size`,
            fallback: defaultTypography.bodyFontSize,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "bodyLineHeight",
            label: "Body line height",
            description: "Controls vertical breathing room between lines of body text.",
            inputId: `${pageId}-body-line-height`,
            fallback: defaultTypography.bodyLineHeight,
            format: (value) => value.toFixed(2),
          })}
          {renderTypographyControl({
            keyName: "headingBaseSize",
            label: "Heading size",
            description: "Defines the top heading size that the lower levels scale down from.",
            inputId: `${pageId}-heading-base-size`,
            fallback: defaultTypography.headingBaseSize,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "headingScale",
            label: "Heading scale",
            description: "Changes how quickly heading levels step down from h1 to h4.",
            inputId: `${pageId}-heading-scale`,
            fallback: defaultTypography.headingScale,
            format: (value) => `${value.toFixed(2)}x`,
          })}
          {renderTypographyControl({
            keyName: "headingIndentStep",
            label: "Heading indent step",
            description: "Adds extra left offset for deeper heading levels and their section content.",
            inputId: `${pageId}-heading-indent-step`,
            fallback: defaultTypography.headingIndentStep,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "paragraphSpacing",
            label: "Paragraph spacing",
            description: "Sets the spacing between paragraphs, callouts, media, and display blocks.",
            inputId: `${pageId}-paragraph-spacing`,
            fallback: defaultTypography.paragraphSpacing,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "contentWidth",
            label: "Reading width",
            description: "Limits the text measure so the reading column feels tighter or wider.",
            inputId: `${pageId}-content-width`,
            fallback: defaultTypography.contentWidth,
            format: (value) => `${value.toFixed(0)}ch`,
          })}
          {renderTypographyControl({
            keyName: "codeBlockFontSize",
            label: "Code block size",
            description: "Scales fenced code blocks so command snippets can read tighter or larger.",
            inputId: `${pageId}-code-block-size`,
            fallback: defaultTypography.codeBlockFontSize,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "codeBlockPaddingY",
            label: "Code padding Y",
            description: "Controls the top and bottom inset between the code text and the block edge.",
            inputId: `${pageId}-code-padding-y`,
            fallback: defaultTypography.codeBlockPaddingY,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "codeBlockPaddingX",
            label: "Code padding X",
            description: "Controls the left and right inset between the code text and the block edge.",
            inputId: `${pageId}-code-padding-x`,
            fallback: defaultTypography.codeBlockPaddingX,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "codeBlockInsetLeft",
            label: "Code inset left",
            description: "Pulls the full code block inward from the left edge of the reading column.",
            inputId: `${pageId}-code-inset-left`,
            fallback: defaultTypography.codeBlockInsetLeft,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "codeBlockInsetRight",
            label: "Code inset right",
            description: "Pulls the full code block inward from the right edge of the reading column.",
            inputId: `${pageId}-code-inset-right`,
            fallback: defaultTypography.codeBlockInsetRight,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
        </div>
      </details>
        );
      })()
    );

  const renderBookSettingsPanel = () => (
    <details
      className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-5"
      style={workspacePanelStyle}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="paper-label mb-1">Book settings</p>
          <p className="text-sm text-[var(--paper-muted)]">
            Controls the landing-page notebook cover styling for this book.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="paper-button paper-button-secondary px-3 py-2 text-sm"
            onClick={(event) => {
              event.preventDefault();
              void saveTypography();
            }}
          >
            Save book settings
          </button>
          <ChevronDown className="h-4 w-4 text-[var(--paper-muted)]" />
        </div>
      </summary>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid gap-2">
          <label className="paper-label mb-0" htmlFor={`${pageId}-book-cover-color`}>
            Cover page color
          </label>
          <p className="text-sm leading-6 text-[var(--paper-muted)]">
            Used for the notebook cover on the landing page so each published book can read as a distinct object.
          </p>
          <div className="grid gap-2">
            <p className="paper-label mb-0">Suggested covers</p>
            <div className="flex flex-wrap gap-2">
              {bookCoverColorPresets.map((preset) => {
                const active = coverColor.toLowerCase() === preset.value.toLowerCase();
                return (
                  <button
                    key={preset.value}
                    type="button"
                    className="grid w-[74px] justify-items-center gap-1.5 text-center"
                    onClick={() => setCoverColor(preset.value)}
                    aria-pressed={active}
                    title={preset.label}
                  >
                    <span
                      className="relative h-9 w-9 rounded-full transition"
                      style={{
                        background: `
                          radial-gradient(circle at 30% 28%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.22) 22%, transparent 42%),
                          linear-gradient(135deg, ${preset.value} 0%, color-mix(in srgb, ${preset.value} 62%, #000 38%) 100%)
                        `,
                        boxShadow: active
                          ? "0 0 0 3px rgba(32,28,24,0.12), 0 8px 18px rgba(32,28,24,0.16)"
                          : "0 6px 14px rgba(32,28,24,0.1)",
                        transform: active ? "translateY(-1px)" : undefined,
                      }}
                    />
                    <span
                      className="text-[0.68rem] font-medium leading-tight"
                      style={{
                        color: active ? "var(--paper-ink)" : "var(--paper-muted)",
                      }}
                    >
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id={`${pageId}-book-cover-color`}
              type="color"
              className="editor-toolbar-color h-11 w-14"
              value={coverColor}
              onChange={(event) => setCoverColor(event.target.value)}
              aria-label="Book cover color"
            />
            <input
              className="paper-input max-w-[180px]"
              type="text"
              value={coverColor}
              onChange={(event) => {
                const nextValue = event.target.value.trim();
                if (HEX_COLOR_PATTERN.test(nextValue)) {
                  setCoverColor(nextValue);
                }
              }}
              spellCheck={false}
              inputMode="text"
              aria-label="Book cover color hex value"
            />
          </div>
        </div>
        <div
          className="rounded-[24px] border border-[var(--paper-border)] p-4"
          style={{
            background:
              `linear-gradient(180deg, rgba(255,255,255,0.06), transparent 22%), ` +
              `linear-gradient(135deg, ${coverColor} 0%, color-mix(in srgb, ${coverColor} 62%, #000 38%) 100%)`,
          }}
        >
          <div className="grid h-full grid-cols-[46px_minmax(0,1fr)] overflow-hidden rounded-[20px] bg-[rgba(0,0,0,0.08)] text-[#f7eedf]">
            <div className="relative flex items-center justify-center bg-[rgba(0,0,0,0.12)]">
              <BookSettingsSpine />
            </div>
            <div className="grid content-start gap-2 px-4 py-4">
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[rgba(247,237,220,0.72)]">
                Book
              </span>
              <p className="m-0 font-serif text-xl leading-none">{title || "Untitled book"}</p>
              <p className="m-0 text-sm leading-6 text-[rgba(247,237,220,0.74)]">
                Landing-page notebook preview
              </p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );

  const renderMediaPanel = () => (
    <details
      className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-5"
      style={workspacePanelStyle}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="paper-label mb-1">Media</p>
          <p className="text-sm text-[var(--paper-muted)]">
            Media links referenced by this {mode}. Missing files are shown so you can repair links.
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-[var(--paper-muted)]" />
      </summary>

      <div className="mt-5 grid gap-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            className="paper-button paper-button-secondary flex items-center gap-2 px-3 py-2 text-sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {pageMediaAssets.length ? (
          pageMediaAssets.map((asset) => (
            <div
              key={asset.url}
              className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-3"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--paper-ink)] flex items-center gap-2">
                    {asset.name}
                    {asset.missing ? (
                      <span className="rounded-full border border-[rgba(145,47,47,0.28)] bg-[rgba(145,47,47,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--paper-danger)]">
                        Missing
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-[var(--paper-muted)]">
                    {asset.relativePath ?? asset.url}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="panel-icon-button"
                    title="Rename media file"
                    aria-label="Rename media file"
                    onClick={() => void renameMediaAsset(asset)}
                    disabled={asset.missing || mediaRenamePendingUrl === asset.url}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="panel-icon-button"
                    title="Copy media link"
                    aria-label="Copy media link"
                    onClick={() => void copyMediaLink(asset.url)}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {asset.missing ? (
                    <button
                      type="button"
                      className="panel-icon-button"
                      title="Open media file"
                      aria-label="Open media file"
                      disabled
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  ) : (
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="panel-icon-button"
                      title="Open media file"
                      aria-label="Open media file"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    className="panel-icon-button text-[var(--paper-danger)]"
                    title={asset.references.length ? "Force delete media" : "Delete media"}
                    aria-label={asset.references.length ? "Force delete media" : "Delete media"}
                    onClick={() => void deleteMediaAsset(asset, asset.references.length > 0)}
                    disabled={asset.missing}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid gap-1 text-xs text-[var(--paper-muted)]">
                <p>{formatFileSize(asset.size)} - updated {formatMediaUpdatedAt(asset.modifiedAt)}</p>
                {asset.missing ? (
                  <p className="text-[var(--paper-danger)]">
                    Referenced in content but file is missing on disk.
                  </p>
                ) : null}
                {asset.references.length ? (
                  <div className="rounded-[14px] border border-[rgba(188,128,53,0.2)] bg-[rgba(188,128,53,0.08)] px-2.5 py-2">
                    <p className="font-medium text-[color:var(--paper-accent)]">
                      Referenced in {asset.references.length} page
                      {asset.references.length === 1 ? "" : "s"}
                    </p>
                    <div className="mt-1 grid gap-1">
                      {asset.references.slice(0, 4).map((reference) => (
                        <Link
                          key={reference.id}
                          href={reference.route}
                          className="truncate text-[var(--paper-muted)] transition hover:text-[var(--paper-ink)]"
                        >
                          {reference.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p>No references detected.</p>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--paper-muted)]">
            No media references detected for this {mode} yet.
          </p>
        )}
      </div>
    </details>
  );

  return (
    <div className="grid items-start">
      <section className="grid auto-rows-max content-start self-start" style={workspaceGapStyle}>
        <div
          className="flex flex-wrap items-start justify-between gap-4 self-start border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-5"
          style={workspacePanelStyle}
        >
          <div
            className="grid gap-2"
            data-font-preset={fontPreset}
            style={contentTypographyStyle}
          >
            <div className="flex items-center gap-2">
              <span className="paper-badge">{mode}</span>
              <span className="paper-badge">{status}</span>
            </div>
            <h1 className={mode === "chapter" ? "chapter-hero-title" : "book-hero-title"}>
              {title}
            </h1>
            {summary ? (
              <p
                className={
                  mode === "chapter" ? "chapter-hero-summary mt-3" : "book-hero-summary mt-3"
                }
              >
                {summary}
              </p>
            ) : null}
            <p className="text-sm text-[var(--paper-muted)]">{saveMessage}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="paper-button paper-button-secondary flex items-center gap-2" onClick={manualSave}>
              <Save className="h-4 w-4" />
              Save snapshot
            </button>
            <button
              type="button"
              className="paper-button flex items-center gap-2"
              onClick={() => togglePublication(status !== "published")}
              disabled={isPending}
            >
              <Globe className="h-4 w-4" />
              {status === "published" ? "Unpublish" : "Publish"}
            </button>
            {currentPublicRoute ? (
              <Link href={currentPublicRoute} className="paper-button paper-button-secondary">
                Open public page
              </Link>
            ) : null}
          </div>
        </div>

        <div
          ref={editorSplitRef}
          className={cn("editor-split-layout", isDraggingSplit && "editor-split-layout-dragging")}
          style={editorSplitStyle}
        >
          <div
            ref={sourcePanelRef}
            className={cn(
              "editor-split-panel rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-4",
              isSourceCollapsed && "is-collapsed",
            )}
            style={workspacePanelStyle}
          >
              <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="paper-label">Markdown source</p>
                <p className="text-sm text-[var(--paper-muted)]">
                  Use markdown, `[[wiki links]]`, and fenced `python exec` blocks.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="paper-button paper-button-secondary px-3 py-2 text-sm"
                  onClick={revealCurrentSourceInPreview}
                >
                  Reveal in preview
                </button>
                <button
                  type="button"
                  className="panel-chevron-button"
                  onClick={togglePreviewPanel}
                  aria-expanded={!isPreviewCollapsed}
                  aria-label={isPreviewCollapsed ? "Show live preview" : "Hide live preview"}
                >
                  <ChevronLeft
                    className={cn("h-4 w-4 transition-transform", !isPreviewCollapsed && "rotate-180")}
                  />
                </button>
                <span className="paper-badge">
                  <CloudUpload className="h-3.5 w-3.5" />
                  {saveState}
                </span>
              </div>
            </div>
            <div className="editor-toolbar">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,image/avif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadImageAndInsert(file);
                  }
                  event.target.value = "";
                }}
              />
              <input
                ref={uploadFileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length > 0) {
                    void uploadFilesAndInsert(files);
                  }
                  event.target.value = "";
                }}
              />
              <input
                ref={uploadFolderInputRef}
                type="file"
                className="hidden"
                multiple
                {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length > 0) {
                    void uploadFolderArchiveAndInsert(files);
                  }
                  event.target.value = "";
                }}
              />
              {toolbarActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="editor-toolbar-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={action.run}
                  title={action.title}
                  aria-label={action.label}
                  disabled={
                    (imageUploadPending && action.id === "image") ||
                    (fileUploadPending &&
                      (action.id === "upload-file" || action.id === "upload-folder"))
                  }
                  >
                    {action.icon}
                  </button>
                ))}
              <div className="editor-toolbar-divider" aria-hidden="true" />
              <label className="editor-toolbar-control">
                <span className="sr-only">Inline text size</span>
                <select
                  className="paper-select editor-toolbar-select"
                  value={inlineTextSize}
                  onChange={(event) =>
                    setInlineTextSize(
                      event.target.value as (typeof inlineTextSizeOptions)[number]["value"],
                    )
                  }
                  aria-label="Inline text size"
                >
                  {inlineTextSizeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="editor-toolbar-control">
                <span className="sr-only">Inline text color</span>
                <input
                  type="color"
                  className="editor-toolbar-color"
                  value={inlineTextColor}
                  onChange={(event) => setInlineTextColor(event.target.value)}
                  aria-label="Inline text color"
                />
              </label>
              <button
                type="button"
                className="editor-toolbar-button px-3"
                onMouseDown={(event) => event.preventDefault()}
                onClick={applyInlineTextStyle}
                title="Apply text style to selection"
                aria-label="Apply text style to selection"
              >
                <span className="text-xs font-semibold">Aa</span>
              </button>
            </div>
            <div className="editor-source-shell" data-font-preset={fontPreset}>
              {wikiAutocompleteSuggestions.length > 0 ? (
                <div className="editor-autocomplete-panel" role="listbox" aria-label="Wiki link suggestions">
                  <div className="editor-autocomplete-header">
                    <span className="paper-label mb-0">Wiki links</span>
                    <span className="text-xs text-[var(--paper-muted)]">{`[[${wikiAutocompleteContext?.query ?? ""}`}</span>
                  </div>
                  <div className="editor-autocomplete-list">
                    {wikiAutocompleteSuggestions.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={index === activeWikiAutocompleteIndex}
                        className={cn(
                          "editor-autocomplete-item",
                          index === activeWikiAutocompleteIndex && "is-active",
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyWikiAutocompleteItem(item)}
                      >
                        <span className="editor-autocomplete-label">{item.label}</span>
                        <span className="editor-autocomplete-detail">{item.detail}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : mathAutocompleteSuggestions.length > 0 ? (
                <div
                  ref={mathAutocompletePanelRef}
                  className="editor-autocomplete-panel"
                  role="listbox"
                  aria-label="Math suggestions"
                >
                  <div className="editor-autocomplete-header">
                    <span className="paper-label mb-0">Math commands</span>
                    <span className="text-xs text-[var(--paper-muted)]">{`\\${mathAutocompleteContext?.query}`}</span>
                  </div>
                  <div className="editor-autocomplete-list">
                    {mathAutocompleteSuggestions.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={index === activeMathAutocompleteIndex}
                        className={cn(
                          "editor-autocomplete-item",
                          index === activeMathAutocompleteIndex && "is-active",
                        )}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyMathAutocompleteItem(item)}
                      >
                        <div className="editor-autocomplete-meta">
                          <span className="editor-autocomplete-label">{item.label}</span>
                          <span className="editor-autocomplete-detail">{item.detail}</span>
                        </div>
                        <span className="editor-autocomplete-math-preview">{`\\(${item.previewLatex}\\)`}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <textarea
                ref={sourceRef}
                className="paper-textarea editor-source"
                value={body}
                onChange={(event) => {
                  rememberSourceViewport(event.target);
                  commitBody(event.target.value, {
                    start: event.target.selectionStart,
                    end: event.target.selectionEnd,
                    scrollTop: event.target.scrollTop,
                    scrollLeft: event.target.scrollLeft,
                  });
                  syncAutocomplete(event.target.value, event.target.selectionStart);
                }}
                onClick={(event) => {
                  rememberSourceViewport(event.currentTarget);
                  syncAutocomplete(event.currentTarget.value, event.currentTarget.selectionStart);
                }}
                onSelect={(event) => {
                  rememberSourceViewport(event.currentTarget);
                  syncAutocomplete(event.currentTarget.value, event.currentTarget.selectionStart);
                }}
                onScroll={(event) => rememberSourceViewport(event.currentTarget)}
                onKeyDown={(event) => {
                  rememberSourceViewport(event.currentTarget);
                  if (handleDelimiterKeyDown(event)) {
                    return;
                  }

                  if (wikiAutocompleteSuggestions.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveWikiAutocompleteIndex((current) =>
                        Math.min(current + 1, wikiAutocompleteSuggestions.length - 1),
                      );
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveWikiAutocompleteIndex((current) => Math.max(current - 1, 0));
                      return;
                    }

                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      const nextItem = wikiAutocompleteSuggestions[activeWikiAutocompleteIndex];
                      if (nextItem) {
                        applyWikiAutocompleteItem(nextItem);
                      }
                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setWikiAutocompleteContext(null);
                      return;
                    }
                  }

                  if (mathAutocompleteSuggestions.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveMathAutocompleteIndex((current) =>
                        Math.min(current + 1, mathAutocompleteSuggestions.length - 1),
                      );
                      return;
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveMathAutocompleteIndex((current) => Math.max(current - 1, 0));
                      return;
                    }

                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      const nextItem = mathAutocompleteSuggestions[activeMathAutocompleteIndex];
                      if (nextItem) {
                        applyMathAutocompleteItem(nextItem);
                      }
                      return;
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setMathAutocompleteContext(null);
                      return;
                    }
                  }

                  const combo = shortcutFromKeyboardEvent(event);
                  if (!combo) {
                    return;
                  }

                  const matchedShortcut = (
                    Object.entries(editorShortcuts) as Array<
                      [ShortcutActionId, string]
                    >
                  ).find(([, shortcut]) => shortcut === combo);

                  if (!matchedShortcut) {
                    return;
                  }

                  event.preventDefault();
                  runShortcutAction(matchedShortcut[0]);
                }}
                onPaste={(event) => {
                  rememberSourceViewport(event.currentTarget);
                  const items = Array.from(event.clipboardData?.items ?? []);
                  const imageItem = items.find((item) => item.type.startsWith("image/"));
                  const file = imageItem?.getAsFile();
                  if (!file) {
                    return;
                  }

                  event.preventDefault();
                  void uploadImageAndInsert(file, {
                    start: event.currentTarget.selectionStart,
                    end: event.currentTarget.selectionEnd,
                    scrollTop: event.currentTarget.scrollTop,
                    scrollLeft: event.currentTarget.scrollLeft,
                  });
                }}
              />
            </div>
          </div>

          <button
            type="button"
            className="editor-split-handle"
            aria-label="Resize editor panels. Double-click to hide or restore the preview."
            title="Drag to resize. Double-click to hide or restore the preview."
            onPointerDown={(event) => {
              event.preventDefault();
              setIsDraggingSplit(true);
              updateSplitFromClientX(event.clientX);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              togglePreviewPanel();
            }}
          >
            <span className="editor-split-grip">
              <span className="editor-split-bar" aria-hidden="true" />
              <GripVertical className="h-4 w-4" />
              <span className="editor-split-bar" aria-hidden="true" />
            </span>
          </button>

          <div
            ref={previewPanelRef}
            className={cn(
              "editor-split-panel rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-4",
              isPreviewCollapsed && "is-collapsed",
            )}
            style={workspacePanelStyle}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="paper-label">Live preview</p>
                <p className="text-sm text-[var(--paper-muted)]">
                  Uses the saved public-page render path. Click a preview dot to jump to source.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="paper-badge">
                  <Sparkles className="h-3.5 w-3.5" />
                  Preview
                </span>
              </div>
            </div>
            <div
              ref={previewViewportRef}
              className="editor-preview pr-1"
              data-font-preset={fontPreset}
            >
              <div
                className="editor-preview-offset"
                aria-hidden="true"
                style={{ height: `${previewOffset}px` }}
              />
              <iframe
                ref={previewFrameRef}
                title="Live preview"
                src={`/app/preview?pageId=${encodeURIComponent(currentPageId)}&v=${previewVersion}`}
                className="preview-frame"
              />
            </div>
          </div>
        </div>

        {rightPanelRoot ? createPortal(inspectorContent, rightPanelRoot) : null}

        {mode === "book" ? renderBookSettingsPanel() : null}

        {mode === "book"
          ? renderTypographyPanel({
              title: "Advanced typography",
              description:
                "Control heading scale, body size, spacing, and reading width.",
            })
          : null}

        {mode === "note"
          ? renderTypographyPanel({
              title: "Note typography",
              description:
                "Control heading scale, body size, spacing, indentation, and reading width for this note.",
              defaultTypography: defaultNoteTypography,
              })
            : null}

        {renderMediaPanel()}
      </section>
    </div>
  );
}

