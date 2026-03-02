"use client";

import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import Link from "next/link";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CheckCircle2,
  ChevronDown,
  Code2,
  CloudUpload,
  Globe,
  GripVertical,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  RefreshCcw,
  Save,
  Sigma,
  Sparkles,
  Youtube,
} from "lucide-react";
import {
  bookTypographyLimits,
  bookTypographyStyle,
  defaultBookTypography,
  normalizeBookTypography,
  type BookTypography,
} from "@/lib/book-typography";
import type { ManifestEntry } from "@/lib/content/schemas";
import { fontPresetOptions, type FontPreset } from "@/lib/font-presets";
import type { TocItem } from "@/lib/markdown/shared";
import { buildInlineTextStyleHref, cn, normalizeYouTubeEmbedInput } from "@/lib/utils";

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
    visibility?: "public" | "private";
    allowExecution?: boolean;
    theme?: "paper" | "graphite";
    fontPreset?: FontPreset;
    typography?: Partial<BookTypography>;
    order?: number;
  };
  toc: TocItem[];
  backlinks: ManifestEntry[];
  unresolvedLinks: string[];
  revisions: string[];
  updateEndpoint: string;
  extraActions?: React.ReactNode;
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

const inlineTextSizeOptions = [
  { value: "inherit", label: "Text size" },
  { value: "0.9em", label: "Small" },
  { value: "1em", label: "Base" },
  { value: "1.15em", label: "Large" },
  { value: "1.3em", label: "XL" },
] as const;

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
  updateEndpoint,
  extraActions,
}: EditorShellProps) {
  const workspacePanelStyle = {
    borderRadius: "var(--workspace-corner-radius, 28px)",
  } as CSSProperties;
  const workspaceGapStyle = {
    gap: "var(--workspace-tile-spacing, 1.5rem)",
  } as CSSProperties;
  const [title, setTitle] = useState(initialValues.title);
  const [slug, setSlug] = useState(initialValues.slug);
  const [summary, setSummary] = useState(initialValues.summary ?? initialValues.description ?? "");
  const [body, setBody] = useState(initialValues.body);
  const [status, setStatus] = useState<"draft" | "published">(initialValues.status);
  const [visibility, setVisibility] = useState<"public" | "private">(
    initialValues.visibility ?? "private",
  );
  const [allowExecution, setAllowExecution] = useState(initialValues.allowExecution ?? true);
  const [theme, setTheme] = useState<"paper" | "graphite">(initialValues.theme ?? "paper");
  const [fontPreset, setFontPreset] = useState<FontPreset>(
    initialValues.fontPreset ?? "source-serif",
  );
  const [typography, setTypography] = useState<BookTypography>(
    normalizeBookTypography(initialValues.typography),
  );
  const [order, setOrder] = useState(initialValues.order ?? 1);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>("Ready");
  const [imageUploadPending, setImageUploadPending] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [editorSplitRatio, setEditorSplitRatio] = useState(52);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [inlineTextSize, setInlineTextSize] = useState<(typeof inlineTextSizeOptions)[number]["value"]>("inherit");
  const [inlineTextColor, setInlineTextColor] = useState("#8f5335");
  const [isPending, startTransition] = useTransition();
  const contentTypographyStyle = bookTypographyStyle(typography);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const editorSplitRef = useRef<HTMLDivElement>(null);
  const sourcePanelRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
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
  const deferredBody = useDeferredValue(body);
  const isSourceCollapsed = editorSplitRatio <= 4;
  const isPreviewCollapsed = editorSplitRatio >= 96;
  const editorSplitStyle = {
    "--editor-source-fr": isSourceCollapsed ? "0.001fr" : `${editorSplitRatio}fr`,
    "--editor-preview-fr": isPreviewCollapsed
      ? "0.001fr"
      : `${100 - editorSplitRatio}fr`,
  } as CSSProperties;

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

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
    () => ({
      title,
      slug,
      body,
      status,
      visibility,
      allowExecution,
      summary: mode === "note" || mode === "chapter" ? summary : undefined,
      description: mode === "book" ? summary : undefined,
      theme: mode === "book" ? theme : undefined,
      fontPreset,
      typography: mode === "book" || mode === "note" ? typography : undefined,
      order: mode === "chapter" ? order : undefined,
    }),
    [
      allowExecution,
      body,
      fontPreset,
      mode,
      order,
      slug,
      status,
      summary,
      theme,
      title,
      typography,
      visibility,
    ],
  );

  useEffect(() => {
    const timer = setTimeout(async () => {
      setSaveState("saving");
      setSaveMessage("Autosaving...");
      try {
        const response = await fetch(updateEndpoint, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Autosave failed");
        }

        setSaveState("saved");
        setSaveMessage("Autosaved");
        setPreviewVersion((current) => current + 1);
      } catch {
        setSaveState("error");
        setSaveMessage("Autosave failed");
      }
    }, 1400);

    return () => clearTimeout(timer);
  }, [payload, updateEndpoint]);

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
    const response = await fetch(updateEndpoint, {
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

    setSaveState("saved");
    setSaveMessage("Snapshot saved");
    setPreviewVersion((current) => current + 1);
  };

  const saveTypography = async () => {
    setSaveState("saving");
    setSaveMessage("Saving typography...");
    const response = await fetch(updateEndpoint, {
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

    setSaveState("saved");
    setSaveMessage("Typography saved");
    setPreviewVersion((current) => current + 1);
  };

  const togglePublication = (nextPublished: boolean) => {
    startTransition(async () => {
      const endpoint = nextPublished ? "/api/publish" : "/api/unpublish";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: pageId }),
      });

      if (!response.ok) {
        setSaveState("error");
        setSaveMessage(nextPublished ? "Publish failed" : "Unpublish failed");
        return;
      }

      setStatus(nextPublished ? "published" : "draft");
      if (nextPublished) {
        setVisibility("public");
      }
      setSaveState("saved");
      setSaveMessage(nextPublished ? "Published" : "Moved to draft");
      setPreviewVersion((current) => current + 1);
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

  const focusSourceLine = (line: number) => {
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
  };

  const revealCurrentSourceInPreview = () => {
    const textarea = sourceRef.current;
    const previewWindow = previewFrameRef.current?.contentWindow;
    if (!textarea || !previewWindow) {
      return;
    }

    const line = sourceLineFromOffset(bodyRef.current, textarea.selectionStart);
    previewWindow.postMessage(
      {
        type: "webbook-editor-preview-line",
        line,
      },
      window.location.origin,
    );
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        data.type !== "webbook-preview-source-line" ||
        typeof data.line !== "number"
      ) {
        return;
      }

      focusSourceLine(data.line);
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
        throw new Error("Image upload failed");
      }

      const payload = (await response.json()) as ImageUploadPayload;
      const markdown = `\n![${payload.alt}](${payload.url})\n`;
      insertMarkdownAtRange(markdown, targetSelection);
      setSaveState("saved");
      setSaveMessage("Image uploaded");
    } catch {
      setSaveState("error");
      setSaveMessage("Image upload failed");
    } finally {
      setImageUploadPending(false);
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
      run: () =>
        applyMarkdown((selectedText) => {
          const nextSelection = selectedText || "bold text";
          return {
            nextSelection,
            replacement: `**${nextSelection}**`,
            selectionOffsetStart: 2,
          };
        }),
    },
    {
      id: "italic",
      label: "Italic",
      title: "Italic",
      icon: <Italic className="h-4 w-4" />,
      run: () =>
        applyMarkdown((selectedText) => {
          const nextSelection = selectedText || "italic text";
          return {
            nextSelection,
            replacement: `*${nextSelection}*`,
            selectionOffsetStart: 1,
          };
        }),
    },
    {
      id: "inline-math",
      label: "Inline math",
      title: "Inline math",
      icon: <Sigma className="h-4 w-4" />,
      run: () =>
        applyMarkdown((selectedText) => {
          const nextSelection = selectedText || "x^2";
          return {
            nextSelection,
            replacement: `$${nextSelection}$`,
            selectionOffsetStart: 1,
          };
        }),
    },
    {
      id: "block-math",
      label: "Block math",
      title: "Block math",
      icon: <span className="text-xs font-semibold">$$</span>,
      run: () =>
        applyMarkdown((selectedText) => {
          const nextSelection = selectedText || "x^2 + y^2 = z^2";
          return {
            nextSelection,
            replacement: `\n$$\n${nextSelection}\n$$\n`,
            selectionOffsetStart: 4,
          };
        }),
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
      id: "image",
      label: "Insert image",
      title: "Insert image",
      icon: <ImagePlus className="h-4 w-4" />,
      run: () => fileInputRef.current?.click(),
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

  const renderTypographyPanel = ({
    title,
    description,
    open = false,
  }: {
    title: string;
    description: string;
    open?: boolean;
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
            fallback: defaultBookTypography.bodyFontSize,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "bodyLineHeight",
            label: "Body line height",
            description: "Controls vertical breathing room between lines of body text.",
            inputId: `${pageId}-body-line-height`,
            fallback: defaultBookTypography.bodyLineHeight,
            format: (value) => value.toFixed(2),
          })}
          {renderTypographyControl({
            keyName: "headingBaseSize",
            label: "Heading size",
            description: "Defines the top heading size that the lower levels scale down from.",
            inputId: `${pageId}-heading-base-size`,
            fallback: defaultBookTypography.headingBaseSize,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "headingScale",
            label: "Heading scale",
            description: "Changes how quickly heading levels step down from h1 to h4.",
            inputId: `${pageId}-heading-scale`,
            fallback: defaultBookTypography.headingScale,
            format: (value) => `${value.toFixed(2)}x`,
          })}
          {renderTypographyControl({
            keyName: "headingIndentStep",
            label: "Heading indent step",
            description: "Adds extra left offset for deeper heading levels and their section content.",
            inputId: `${pageId}-heading-indent-step`,
            fallback: defaultBookTypography.headingIndentStep,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "paragraphSpacing",
            label: "Paragraph spacing",
            description: "Sets the spacing between paragraphs, callouts, media, and display blocks.",
            inputId: `${pageId}-paragraph-spacing`,
            fallback: defaultBookTypography.paragraphSpacing,
            format: (value) => `${value.toFixed(2)}rem`,
          })}
          {renderTypographyControl({
            keyName: "contentWidth",
            label: "Reading width",
            description: "Limits the text measure so the reading column feels tighter or wider.",
            inputId: `${pageId}-content-width`,
            fallback: defaultBookTypography.contentWidth,
            format: (value) => `${value.toFixed(0)}ch`,
          })}
        </div>
      </details>
        );
      })()
    );

  return (
    <div
      className="grid items-start editor-workspace-layout"
      style={workspaceGapStyle}
    >
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
            {publicRoute ? (
              <Link href={publicRoute} className="paper-button paper-button-secondary">
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
                    disabled={isPreviewCollapsed}
                  >
                  Reveal in preview
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
              {toolbarActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="editor-toolbar-button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={action.run}
                  title={action.title}
                  aria-label={action.label}
                  disabled={imageUploadPending && action.id === "image"}
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
            <div data-font-preset={fontPreset}>
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
                }}
                onClick={(event) => rememberSourceViewport(event.currentTarget)}
                onSelect={(event) => rememberSourceViewport(event.currentTarget)}
                onScroll={(event) => rememberSourceViewport(event.currentTarget)}
                onKeyDown={(event) => {
                  const isPrimaryModifier = event.metaKey || event.ctrlKey;
                  rememberSourceViewport(event.currentTarget);
                  if (!isPrimaryModifier) {
                    return;
                  }

                  const key = event.key.toLowerCase();
                  const isUndo = key === "z" && !event.shiftKey;
                  const isRedo = key === "y" || (key === "z" && event.shiftKey);

                  if (isUndo) {
                    event.preventDefault();
                    if (historyIndexRef.current === 0) {
                      return;
                    }

                    historyIndexRef.current -= 1;
                    restoreHistorySnapshot(historyRef.current[historyIndexRef.current]);
                    return;
                  }

                  if (isRedo) {
                    event.preventDefault();
                    if (historyIndexRef.current >= historyRef.current.length - 1) {
                      return;
                    }

                    historyIndexRef.current += 1;
                    restoreHistorySnapshot(historyRef.current[historyIndexRef.current]);
                  }
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
            aria-label="Resize editor panels"
            onPointerDown={(event) => {
              event.preventDefault();
              setIsDraggingSplit(true);
              updateSplitFromClientX(event.clientX);
            }}
          >
            <span className="editor-split-grip">
              <GripVertical className="h-4 w-4" />
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
              <span className="paper-badge">
                <Sparkles className="h-3.5 w-3.5" />
                Preview
              </span>
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
                key={`${pageId}-${previewVersion}`}
                title="Live preview"
                src={`/app/preview?pageId=${encodeURIComponent(pageId)}&v=${previewVersion}`}
                className="preview-frame"
              />
            </div>
          </div>
        </div>

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
              })
            : null}
      </section>

      <aside className="grid self-start" style={workspaceGapStyle}>
        <div
          className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
          style={workspacePanelStyle}
        >
          <p className="paper-label">Page settings</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
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
                onChange={(event) => setSlug(event.target.value)}
              />
            </div>
            <div className={mode === "chapter" ? "" : "md:col-span-2 xl:col-span-1"}>
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
            {mode === "chapter" ? (
              <div>
                <label className="paper-label" htmlFor={`${pageId}-order`}>
                  Order
                </label>
                <input
                  id={`${pageId}-order`}
                  className="paper-input"
                  type="number"
                  min={0}
                  value={order}
                  onChange={(event) => setOrder(Number(event.target.value) || 0)}
                />
              </div>
            ) : null}
            {mode === "book" ? (
              <div>
                <label className="paper-label" htmlFor={`${pageId}-theme`}>
                  Theme
                </label>
                <select
                  id={`${pageId}-theme`}
                  className="paper-select"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as "paper" | "graphite")}
                >
                  <option value="paper">Paper</option>
                  <option value="graphite">Graphite</option>
                </select>
              </div>
            ) : null}
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
            {mode !== "chapter" ? (
              <div>
                <label className="paper-label" htmlFor={`${pageId}-visibility`}>
                  Visibility
                </label>
                <select
                  id={`${pageId}-visibility`}
                  className="paper-select"
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(event.target.value as "public" | "private")
                  }
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              </div>
            ) : null}
            {mode !== "book" ? (
              <label className="flex items-center gap-3 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.5)] px-4 py-3 md:col-span-2 xl:col-span-1">
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

        <div
          className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5"
          style={workspacePanelStyle}
        >
          <p className="paper-label">Context</p>
          <div className="grid gap-3">
            <div className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--paper-muted)]">Path</p>
              <p className="mt-1 text-sm font-medium">{path}</p>
            </div>
            {publicRoute ? (
              <Link
                href={publicRoute}
                className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-3 text-sm text-[var(--paper-muted)] transition hover:text-[var(--paper-ink)]"
              >
                Public route: {publicRoute}
              </Link>
            ) : null}
          </div>
        </div>

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

        {extraActions}
      </aside>
    </div>
  );
}
