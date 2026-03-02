"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, CloudUpload, Globe, RefreshCcw, Save, Sparkles } from "lucide-react";
import type { ManifestEntry } from "@/lib/content/schemas";
import type { TocItem } from "@/lib/markdown/shared";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

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
  const [order, setOrder] = useState(initialValues.order ?? 1);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState<string>("Ready");
  const [isPending, startTransition] = useTransition();
  const deferredBody = useDeferredValue(body);

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
      order: mode === "chapter" ? order : undefined,
    }),
    [allowExecution, body, mode, order, slug, status, summary, theme, title, visibility],
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
      } catch {
        setSaveState("error");
        setSaveMessage("Autosave failed");
      }
    }, 1400);

    return () => clearTimeout(timer);
  }, [payload, updateEndpoint]);

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
    });
  };

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
            <textarea
              className="paper-textarea editor-source"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.6)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="paper-label">Live preview</p>
                <p className="text-sm text-[var(--paper-muted)]">
                  Shared render pipeline with MathJax and executable Python blocks.
                </p>
              </div>
              <span className="paper-badge">
                <Sparkles className="h-3.5 w-3.5" />
                Preview
              </span>
            </div>
            <div className="editor-preview pr-1">
              <MarkdownRenderer
                markdown={deferredBody}
                manifest={manifest}
                pageId={pageId}
                requester="admin"
                allowExecution={allowExecution}
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
