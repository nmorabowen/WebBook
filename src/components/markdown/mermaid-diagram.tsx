"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MermaidDiagramProps = {
  code: string;
  id?: string;
  sourceLine?: number;
};

type MermaidModule = typeof import("mermaid").default;

let mermaidModulePromise: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((mod) => mod.default);
  }
  return mermaidModulePromise;
}

const LIGHT_PALETTE = {
  cream: "#fdfbf5",
  ink: "#1f1d1a",
  muted: "#6b645a",
  border: "#d6cfc1",
  accentSoft: "#e8efff",
  panel: "#f4efe4",
  panelStrong: "#e8e1d0",
} as const;

function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function triggerSvgDownload(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function MermaidDiagram({ code, id, sourceLine }: MermaidDiagramProps) {
  const reactId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const diagramId = `mermaid-${id ?? stableHash(code)}-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

    (async () => {
      try {
        const mermaid = await loadMermaid();
        const palette = LIGHT_PALETTE;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "inherit",
          themeVariables: {
            background: palette.cream,
            primaryColor: palette.panel,
            primaryBorderColor: palette.border,
            primaryTextColor: palette.ink,
            secondaryColor: palette.panelStrong,
            secondaryBorderColor: palette.border,
            secondaryTextColor: palette.ink,
            tertiaryColor: palette.accentSoft,
            tertiaryBorderColor: palette.border,
            tertiaryTextColor: palette.ink,
            lineColor: palette.muted,
            textColor: palette.ink,
            mainBkg: palette.panel,
            nodeBorder: palette.border,
            clusterBkg: palette.cream,
            clusterBorder: palette.border,
            titleColor: palette.ink,
            edgeLabelBackground: palette.cream,
            noteBkgColor: palette.accentSoft,
            noteTextColor: palette.ink,
            noteBorderColor: palette.border,
          },
        });

        const { svg: rendered } = await mermaid.render(diagramId, code);
        if (!cancelled) {
          setError(null);
          setSvg(rendered);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          setSvg(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, id, reactId]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handler);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  const handleDownload = useCallback(() => {
    if (!svg) return;
    triggerSvgDownload(svg, `${id ?? "mermaid-diagram"}.svg`);
  }, [svg, id]);

  if (error) {
    return (
      <div
        className="mermaid-frame mermaid-frame--error"
        data-source-line={sourceLine}
        role="group"
        aria-label="Mermaid diagram error"
      >
        <div className="mermaid-frame__error-title">Mermaid diagram error</div>
        <pre className="mermaid-frame__error-message">{error}</pre>
        <pre className="mermaid-frame__error-source">{code}</pre>
      </div>
    );
  }

  if (svg) {
    return (
      <>
        <div
          ref={hostRef}
          className="mermaid-frame"
          data-source-line={sourceLine}
        >
          <div
            className="mermaid-frame__content"
            role="img"
            aria-label="Mermaid diagram"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <div
            className="mermaid-frame__toolbar"
            role="toolbar"
            aria-label="Diagram actions"
          >
            <button
              type="button"
              className="mermaid-frame__action"
              onClick={() => setIsFullscreen(true)}
              aria-label="Open diagram fullscreen"
              title="Open fullscreen"
            >
              Expand
            </button>
            <button
              type="button"
              className="mermaid-frame__action"
              onClick={handleDownload}
              aria-label="Download diagram as SVG"
              title="Download SVG"
            >
              Download
            </button>
          </div>
        </div>
        {mounted && isFullscreen
          ? createPortal(
              <div
                className="mermaid-fullscreen"
                role="dialog"
                aria-modal="true"
                aria-label="Mermaid diagram fullscreen view"
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    setIsFullscreen(false);
                  }
                }}
              >
                <div className="mermaid-fullscreen__toolbar">
                  <button
                    type="button"
                    className="mermaid-fullscreen__action"
                    onClick={handleDownload}
                  >
                    Download SVG
                  </button>
                  <button
                    type="button"
                    className="mermaid-fullscreen__close"
                    onClick={() => setIsFullscreen(false)}
                    aria-label="Close fullscreen"
                  >
                    Close
                  </button>
                </div>
                <div
                  className="mermaid-fullscreen__stage"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

  return (
    <div
      ref={hostRef}
      className="mermaid-frame mermaid-frame--loading"
      data-source-line={sourceLine}
      role="img"
      aria-label="Mermaid diagram"
    >
      <span className="mermaid-frame__placeholder">Rendering diagram…</span>
    </div>
  );
}
