"use client";

import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
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
  ImagePlus,
  Italic,
  RefreshCcw,
  Save,
  Sigma,
  Sparkles,
  Youtube,
} from "lucide-react";
import {
  defaultBookTypography,
  normalizeBookTypography,
  type BookTypography,
} from "@/lib/book-typography";
import type { ManifestEntry } from "@/lib/content/schemas";
import { fontPresetOptions, type FontPreset } from "@/lib/font-presets";
import type { TocItem } from "@/lib/markdown/shared";
import { normalizeYouTubeEmbedInput } from "@/lib/utils";

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
  const [isPending, startTransition] = useTransition();
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef(initialValues.body);
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

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);

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
      typography: mode === "book" ? typography : undefined,
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

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-5">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <span className="paper-badge">{mode}</span>
              <span className="paper-badge">{status}</span>
            </div>
            <h1 className="font-serif text-4xl leading-none">{title}</h1>
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

        <div className="grid gap-4 rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-5 md:grid-cols-2">
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
          <div className={mode === "chapter" ? "" : "md:col-span-2"}>
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

        {mode === "book" ? (
          <details className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-5" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <p className="paper-label mb-1">Advanced typography</p>
                <p className="text-sm text-[var(--paper-muted)]">
                  Control heading scale, body size, spacing, and reading width.
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-[var(--paper-muted)]" />
            </summary>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="paper-label" htmlFor={`${pageId}-body-font-size`}>
                  Body font size
                </label>
                <input
                  id={`${pageId}-body-font-size`}
                  className="paper-input"
                  type="number"
                  min={0.9}
                  max={1.6}
                  step={0.02}
                  value={typography.bodyFontSize}
                  onChange={(event) =>
                    updateTypography(
                      "bodyFontSize",
                      Number(event.target.value) || defaultBookTypography.bodyFontSize,
                    )
                  }
                />
              </div>
              <div>
                <label className="paper-label" htmlFor={`${pageId}-body-line-height`}>
                  Body line height
                </label>
                <input
                  id={`${pageId}-body-line-height`}
                  className="paper-input"
                  type="number"
                  min={1.4}
                  max={2.4}
                  step={0.05}
                  value={typography.bodyLineHeight}
                  onChange={(event) =>
                    updateTypography(
                      "bodyLineHeight",
                      Number(event.target.value) || defaultBookTypography.bodyLineHeight,
                    )
                  }
                />
              </div>
              <div>
                <label className="paper-label" htmlFor={`${pageId}-heading-base-size`}>
                  Heading size
                </label>
                <input
                  id={`${pageId}-heading-base-size`}
                  className="paper-input"
                  type="number"
                  min={2.2}
                  max={5}
                  step={0.05}
                  value={typography.headingBaseSize}
                  onChange={(event) =>
                    updateTypography(
                      "headingBaseSize",
                      Number(event.target.value) || defaultBookTypography.headingBaseSize,
                    )
                  }
                />
              </div>
              <div>
                <label className="paper-label" htmlFor={`${pageId}-heading-scale`}>
                  Heading scale
                </label>
                <input
                  id={`${pageId}-heading-scale`}
                  className="paper-input"
                  type="number"
                  min={1.05}
                  max={1.8}
                  step={0.05}
                  value={typography.headingScale}
                  onChange={(event) =>
                    updateTypography(
                      "headingScale",
                      Number(event.target.value) || defaultBookTypography.headingScale,
                    )
                  }
                />
              </div>
              <div>
                <label className="paper-label" htmlFor={`${pageId}-heading-indent-step`}>
                  Heading indent step
                </label>
                <input
                  id={`${pageId}-heading-indent-step`}
                  className="paper-input"
                  type="number"
                  min={0}
                  max={3}
                  step={0.05}
                  value={typography.headingIndentStep}
                  onChange={(event) =>
                    updateTypography(
                      "headingIndentStep",
                      Number(event.target.value) || 0,
                    )
                  }
                />
              </div>
              <div>
                <label className="paper-label" htmlFor={`${pageId}-paragraph-spacing`}>
                  Paragraph spacing
                </label>
                <input
                  id={`${pageId}-paragraph-spacing`}
                  className="paper-input"
                  type="number"
                  min={0.5}
                  max={2.4}
                  step={0.05}
                  value={typography.paragraphSpacing}
                  onChange={(event) =>
                    updateTypography(
                      "paragraphSpacing",
                      Number(event.target.value) || defaultBookTypography.paragraphSpacing,
                    )
                  }
                />
              </div>
              <div>
                <label className="paper-label" htmlFor={`${pageId}-content-width`}>
                  Reading width
                </label>
                <input
                  id={`${pageId}-content-width`}
                  className="paper-input"
                  type="number"
                  min={32}
                  max={72}
                  step={1}
                  value={typography.contentWidth}
                  onChange={(event) =>
                    updateTypography(
                      "contentWidth",
                      Number(event.target.value) || defaultBookTypography.contentWidth,
                    )
                  }
                />
              </div>
            </div>
          </details>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="paper-label">Markdown source</p>
                <p className="text-sm text-[var(--paper-muted)]">
                  Use markdown, `[[wiki links]]`, and fenced `python exec` blocks.
                </p>
              </div>
              <span className="paper-badge">
                <CloudUpload className="h-3.5 w-3.5" />
                {saveState}
              </span>
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
            </div>
            <div data-font-preset={fontPreset}>
              <textarea
                ref={sourceRef}
                className="paper-textarea editor-source"
                value={body}
                onChange={(event) =>
                  commitBody(event.target.value, {
                    start: event.target.selectionStart,
                    end: event.target.selectionEnd,
                    scrollTop: event.target.scrollTop,
                    scrollLeft: event.target.scrollLeft,
                  })
                }
                onKeyDown={(event) => {
                  const isPrimaryModifier = event.metaKey || event.ctrlKey;
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

          <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="paper-label">Live preview</p>
                <p className="text-sm text-[var(--paper-muted)]">
                  Uses the saved public-page render path. Updates after autosave.
                </p>
              </div>
              <span className="paper-badge">
                <Sparkles className="h-3.5 w-3.5" />
                Preview
              </span>
            </div>
            <div className="editor-preview pr-1" data-font-preset={fontPreset}>
              <iframe
                key={`${pageId}-${previewVersion}`}
                title="Live preview"
                src={`/app/preview?pageId=${encodeURIComponent(pageId)}&v=${previewVersion}`}
                className="preview-frame"
              />
            </div>
          </div>
        </div>
      </section>

      <aside className="grid gap-5">
        <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5">
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

        <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5">
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

        <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5">
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

        <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5">
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
          <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5">
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
