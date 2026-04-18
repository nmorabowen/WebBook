"use client";

import { useEffect, useId, useRef, useState } from "react";
import { GENERAL_SETTINGS_EVENT } from "@/lib/general-settings";

type MermaidDiagramProps = {
  code: string;
  id?: string;
  sourceLine?: number;
};

type PaletteSnapshot = {
  cream: string;
  ink: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  panel: string;
  panelStrong: string;
};

type MermaidModule = typeof import("mermaid").default;

let mermaidModulePromise: Promise<MermaidModule> | null = null;

function loadMermaid(): Promise<MermaidModule> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((mod) => mod.default);
  }
  return mermaidModulePromise;
}

function readPalette(element: HTMLElement): PaletteSnapshot {
  const styles = getComputedStyle(element);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    cream: read("--paper-cream", "#ffffff"),
    ink: read("--paper-ink", "#1a1a1a"),
    muted: read("--paper-muted", "#666666"),
    border: read("--paper-border", "#d4d4d4"),
    accent: read("--paper-accent", "#2563eb"),
    accentSoft: read("--paper-accent-soft", "#dbeafe"),
    panel: read("--paper-panel", "#f5f5f5"),
    panelStrong: read("--paper-panel-strong", "#e5e5e5"),
  };
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function MermaidDiagram({ code, id, sourceLine }: MermaidDiagramProps) {
  const reactId = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paletteVersion, setPaletteVersion] = useState(0);

  useEffect(() => {
    const handler = () => setPaletteVersion((v) => v + 1);
    window.addEventListener(GENERAL_SETTINGS_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(GENERAL_SETTINGS_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const diagramId = `mermaid-${id ?? stableHash(code)}-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

    (async () => {
      try {
        const mermaid = await loadMermaid();
        const host = hostRef.current ?? document.documentElement;
        const palette = readPalette(host);

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
  }, [code, id, reactId, paletteVersion]);

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
      <div
        ref={hostRef}
        className="mermaid-frame"
        data-source-line={sourceLine}
        role="img"
        aria-label="Mermaid diagram"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
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
