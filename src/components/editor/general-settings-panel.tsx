"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import type { GeneralSettings } from "@/lib/content/schemas";
import { colorThemeOptions, colorThemePresets } from "@/lib/color-themes";
import { GENERAL_SETTINGS_LIMITS } from "@/lib/general-settings-config";
import {
  GENERAL_SETTINGS_SAVE_EVENT,
  GENERAL_SETTINGS_SAVE_STATUS_EVENT,
} from "@/lib/general-settings-events";
import {
  GENERAL_SETTINGS_EVENT,
  GENERAL_SETTINGS_STORAGE_KEY,
} from "@/lib/general-settings";
import { mathJaxFontOptions } from "@/lib/mathjax-fonts";

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

type GeneralSettingsPanelProps = {
  initialSettings: GeneralSettings;
  workspaceStorage: {
    configuredContentRoot: string;
    root: string;
    books: string;
    notes: string;
    systemRoot: string;
    uploads: string;
    revisions: string;
    settings: string;
    users: string;
  };
};

export function GeneralSettingsPanel({
  initialSettings,
  workspaceStorage,
}: GeneralSettingsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [colorTheme, setColorTheme] = useState(initialSettings.colorTheme);
  const [cornerRadius, setCornerRadius] = useState(initialSettings.cornerRadius);
  const [tileSpacing, setTileSpacing] = useState(initialSettings.tileSpacing);
  const [dividerSpacing, setDividerSpacing] = useState(initialSettings.dividerSpacing);
  const [dividerColor, setDividerColor] = useState(initialSettings.dividerColor);
  const [dividerColorInput, setDividerColorInput] = useState(initialSettings.dividerColor);
  const [dividerWidth, setDividerWidth] = useState(initialSettings.dividerWidth);
  const [dividerBackgroundSize, setDividerBackgroundSize] = useState(
    initialSettings.dividerBackgroundSize,
  );
  const [collapseBookChaptersByDefault, setCollapseBookChaptersByDefault] = useState(
    initialSettings.collapseBookChaptersByDefault,
  );
  const [mathFontSize, setMathFontSize] = useState(initialSettings.mathFontSize);
  const [mathFontColor, setMathFontColor] = useState(initialSettings.mathFontColor);
  const [mathFontColorInput, setMathFontColorInput] = useState(
    initialSettings.mathFontColor,
  );
  const [mathFontFamily, setMathFontFamily] = useState(initialSettings.mathFontFamily);
  const [mathInlineVerticalAlign, setMathInlineVerticalAlign] = useState(
    initialSettings.mathInlineVerticalAlign,
  );
  const [mathInlineTranslateY, setMathInlineTranslateY] = useState(
    initialSettings.mathInlineTranslateY,
  );
  const [imageUploadLimitMb, setImageUploadLimitMb] = useState(
    initialSettings.imageUploadLimitMb,
  );
  const [fileUploadLimitMb, setFileUploadLimitMb] = useState(
    initialSettings.fileUploadLimitMb,
  );
  const [workspaceTransferLimitMb, setWorkspaceTransferLimitMb] = useState(
    initialSettings.workspaceTransferLimitMb,
  );
  const [appSidebarWidth, setAppSidebarWidth] = useState(initialSettings.appSidebarWidth);
  const [appInspectorWidth, setAppInspectorWidth] = useState(
    initialSettings.appInspectorWidth,
  );
  const [publicLeftPanelWidth, setPublicLeftPanelWidth] = useState(
    initialSettings.publicLeftPanelWidth,
  );
  const [publicRightPanelWidth, setPublicRightPanelWidth] = useState(
    initialSettings.publicRightPanelWidth,
  );
  const [message, setMessage] = useState("Saved to the workspace.");
  const mathPreviewDoc = useMemo(
    () => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        padding: 1rem;
        background: rgba(255,252,247,0.92);
        color: ${mathFontColor};
        font-family: Georgia, serif;
      }
      .preview-shell {
        min-height: 180px;
        display: grid;
        gap: 0.9rem;
        align-content: start;
      }
      .preview-label {
        font: 600 0.72rem/1.2 sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(32,28,24,0.6);
      }
      .math-line {
        font-size: ${mathFontSize}rem;
      }
      .inline-line {
        font-size: 1.1rem;
        line-height: 1.8;
      }
      .math-inline {
        display: inline-flex;
        align-items: baseline;
        line-height: 1;
        transform: translateY(${mathInlineTranslateY}em);
      }
      mjx-container[jax="SVG"] {
        color: ${mathFontColor};
      }
      .math-inline mjx-container[jax="SVG"] {
        display: inline-flex !important;
        width: auto !important;
        max-width: none !important;
        margin: 0 0.12em;
        vertical-align: ${mathInlineVerticalAlign}em;
        white-space: nowrap !important;
        flex: 0 0 auto;
      }
    </style>
    <script>
      window.MathJax = {
        tex: {
          inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
          displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
          packages: {'[+]': ['ams', 'newcommand', 'base']}
        },
        output: {
          font: '${mathFontFamily}',
          fontPath: 'https://cdn.jsdelivr.net/npm/@mathjax/%%FONT%%-font'
        },
        svg: { fontCache: 'none' }
      };
    </script>
    <script async src="https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js"></script>
  </head>
  <body>
      <div class="preview-shell">
        <div class="preview-label">${mathJaxFontOptions.find((option) => option.value === mathFontFamily)?.label ?? mathFontFamily}</div>
      <div class="inline-line">
        Inline sample:
        <span class="math-inline">\\( e^{i\\pi} + 1 = 0 \\)</span>
        inside text.
      </div>
      <div class="math-line">\\[
        \\int_0^{\\pi} \\sin(x)\\,dx = 2
      \\]</div>
      <div class="math-line">\\[
        \\mathbf{K}
        =
        \\begin{bmatrix}
        12 & -6 \\\\
        -6 & 4
        \\end{bmatrix}
      \\]</div>
    </div>
  </body>
</html>`,
    [
      mathFontColor,
      mathFontFamily,
      mathFontSize,
      mathInlineTranslateY,
      mathInlineVerticalAlign,
    ],
  );

  const save = useEffectEvent(() => {
    window.dispatchEvent(
      new CustomEvent(GENERAL_SETTINGS_SAVE_STATUS_EVENT, {
        detail: "saving",
      }),
    );
    startTransition(async () => {
      const nextSettings = {
        analyticsMeasurementId: initialSettings.analyticsMeasurementId,
        colorTheme,
        cornerRadius,
        tileSpacing,
        dividerSpacing,
        dividerColor,
        dividerWidth,
        dividerBackgroundSize,
        collapseBookChaptersByDefault,
        mathFontSize,
        mathFontColor,
        mathFontFamily,
        mathInlineVerticalAlign,
        mathInlineTranslateY,
        imageUploadLimitMb,
        fileUploadLimitMb,
        workspaceTransferLimitMb,
        appSidebarWidth,
        appInspectorWidth,
        publicLeftPanelWidth,
        publicRightPanelWidth,
      };
      const response = await fetch("/api/settings/general", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nextSettings),
      });

      if (!response.ok) {
        setMessage("Could not save settings.");
        window.dispatchEvent(
          new CustomEvent(GENERAL_SETTINGS_SAVE_STATUS_EVENT, {
            detail: "error",
          }),
        );
        return;
      }

      try {
        window.localStorage.setItem(
          GENERAL_SETTINGS_STORAGE_KEY,
          JSON.stringify(nextSettings),
        );
        window.dispatchEvent(
          new CustomEvent<GeneralSettings>(GENERAL_SETTINGS_EVENT, {
            detail: nextSettings,
          }),
        );
      } catch {}

      setMessage("Workspace settings saved.");
      window.dispatchEvent(
        new CustomEvent(GENERAL_SETTINGS_SAVE_STATUS_EVENT, {
          detail: "saved",
        }),
      );
      if (mathFontFamily !== initialSettings.mathFontFamily) {
        window.location.reload();
        return;
      }

      router.refresh();
    });
  });

  useEffect(() => {
    const handleSaveRequest = () => {
      if (!isPending) {
        save();
      }
    };

    window.addEventListener(GENERAL_SETTINGS_SAVE_EVENT, handleSaveRequest);
    return () => {
      window.removeEventListener(GENERAL_SETTINGS_SAVE_EVENT, handleSaveRequest);
    };
  }, [
    initialSettings.mathFontFamily,
    isPending,
  ]);

  return (
    <section className="dashboard-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="paper-label">General settings</p>
          <p className="text-sm leading-7 text-[var(--paper-muted)]">
            Tune the dashboard card radius and the spacing between dashboard tiles.
          </p>
        </div>
        <span className="paper-badge">{isPending ? "Saving" : "Workspace"}</span>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-4 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4">
          <div>
            <p className="paper-label mb-1">Workspace storage</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Books, notes, uploads, revisions, users, and workspace settings already
              live under one workspace root. Change that root at deploy time with the
              {" "}
              <code>CONTENT_ROOT</code>
              {" "}
              app setting and the host volume mount, not from inside the
              workspace itself.
            </p>
          </div>

          <div className="grid gap-3 text-sm text-[var(--paper-muted)]">
            <div>
              <p className="paper-label mb-1">Configured content root</p>
              <code className="break-all">{workspaceStorage.configuredContentRoot}</code>
            </div>
            <div>
              <p className="paper-label mb-1">Resolved workspace root</p>
              <code className="break-all">{workspaceStorage.root}</code>
            </div>
            <div>
              <p className="paper-label mb-1">Content directories</p>
              <code className="block break-all">{workspaceStorage.books}</code>
              <code className="block break-all">{workspaceStorage.notes}</code>
            </div>
            <div>
              <p className="paper-label mb-1">Internal workspace data</p>
              <code className="block break-all">{workspaceStorage.settings}</code>
              <code className="block break-all">{workspaceStorage.users}</code>
              <code className="block break-all">{workspaceStorage.uploads}</code>
              <code className="block break-all">{workspaceStorage.revisions}</code>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <p className="paper-label mb-0">Color theme</p>
          <div className="flex flex-wrap gap-4">
            {colorThemeOptions.map((option) => {
              const palette = colorThemePresets[option.value];
              const active = colorTheme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="grid w-[74px] justify-items-center gap-2 text-center"
                  onClick={() => setColorTheme(option.value)}
                  aria-pressed={active}
                  title={option.label}
                >
                  <span
                    className="relative grid h-[54px] w-[54px] place-items-center rounded-full transition"
                    style={{
                      background: `
                        radial-gradient(circle at 30% 26%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.38) 18%, transparent 36%),
                        radial-gradient(circle at 32% 30%, ${palette.panelStrong} 0%, ${palette.panel} 26%, ${palette.cream} 54%, ${palette.accent} 100%)
                      `,
                      border: `1px solid ${
                        active ? "var(--paper-ink)" : "var(--paper-border)"
                      }`,
                      boxShadow: active
                        ? `0 0 0 3px rgba(32,28,24,0.12),
                           inset -8px -10px 18px rgba(0,0,0,0.14),
                           inset 6px 8px 14px rgba(255,255,255,0.52),
                           0 10px 18px rgba(32,28,24,0.18)`
                        : `inset -8px -10px 18px rgba(0,0,0,0.12),
                           inset 6px 8px 14px rgba(255,255,255,0.48),
                           0 8px 14px rgba(32,28,24,0.12)`,
                      transform: active ? "translateY(-2px) scale(1.03)" : undefined,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 bottom-[-8px] h-3 rounded-full blur-[6px]"
                      style={{
                        background: `color-mix(in srgb, ${palette.accent} 42%, transparent)`,
                        opacity: active ? 0.55 : 0.35,
                      }}
                    />
                    <span
                      className="pointer-events-none absolute left-[11px] top-[10px] h-3.5 w-3.5 rounded-full blur-[1px]"
                      style={{ background: "rgba(255,255,255,0.72)" }}
                    />
                  </span>
                  <span
                    className="text-xs font-medium leading-tight text-[var(--paper-muted)]"
                    style={{ color: active ? "var(--paper-ink)" : "var(--paper-muted)" }}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-sm text-[var(--paper-muted)]">
            {
              colorThemeOptions.find((option) => option.value === colorTheme)?.description
            }
          </p>
        </div>

        <div>
          <label className="paper-label" htmlFor="general-corner-radius">
            Rounded corners
          </label>
          <input
            id="general-corner-radius"
            type="range"
            min={GENERAL_SETTINGS_LIMITS.cornerRadius.min}
            max={GENERAL_SETTINGS_LIMITS.cornerRadius.max}
            step={GENERAL_SETTINGS_LIMITS.cornerRadius.step}
            value={cornerRadius}
            onChange={(event) => setCornerRadius(Number(event.target.value))}
          />
          <p className="mt-2 text-sm text-[var(--paper-muted)]">{cornerRadius}px</p>
        </div>

        <div>
          <label className="paper-label" htmlFor="general-tile-spacing">
            Tile spacing
          </label>
          <input
            id="general-tile-spacing"
            type="range"
            min={GENERAL_SETTINGS_LIMITS.tileSpacing.min}
            max={GENERAL_SETTINGS_LIMITS.tileSpacing.max}
            step={GENERAL_SETTINGS_LIMITS.tileSpacing.step}
            value={tileSpacing}
            onChange={(event) => setTileSpacing(Number(event.target.value))}
          />
          <p className="mt-2 text-sm text-[var(--paper-muted)]">
            {tileSpacing.toFixed(2)}rem
          </p>
        </div>

        <div className="grid gap-3 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4">
          <div>
            <p className="paper-label mb-1">Workspace dividers</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Controls the resize rails between panels in the editor and public reading view.
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-divider-spacing">
              Divider spacing
            </label>
            <input
              id="general-divider-spacing"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.dividerSpacing.min}
              max={GENERAL_SETTINGS_LIMITS.dividerSpacing.max}
              step={GENERAL_SETTINGS_LIMITS.dividerSpacing.step}
              value={dividerSpacing}
              onChange={(event) => setDividerSpacing(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">{dividerSpacing}px</p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-divider-width">
              Divider line width
            </label>
            <input
              id="general-divider-width"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.dividerWidth.min}
              max={GENERAL_SETTINGS_LIMITS.dividerWidth.max}
              step={GENERAL_SETTINGS_LIMITS.dividerWidth.step}
              value={dividerWidth}
              onChange={(event) => setDividerWidth(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">{dividerWidth}px</p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-divider-background-size">
              Divider background size
            </label>
            <input
              id="general-divider-background-size"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.dividerBackgroundSize.min}
              max={GENERAL_SETTINGS_LIMITS.dividerBackgroundSize.max}
              step={GENERAL_SETTINGS_LIMITS.dividerBackgroundSize.step}
              value={dividerBackgroundSize}
              onChange={(event) => setDividerBackgroundSize(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {dividerBackgroundSize}px
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-divider-color">
              Divider color
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                id="general-divider-color"
                type="color"
                value={dividerColor}
                onChange={(event) => {
                  setDividerColor(event.target.value);
                  setDividerColorInput(event.target.value);
                }}
                aria-label="Divider color"
              />
              <input
                type="text"
                className="paper-input max-w-[180px]"
                value={dividerColorInput}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDividerColorInput(nextValue);
                  if (HEX_COLOR_PATTERN.test(nextValue)) {
                    setDividerColor(nextValue);
                  }
                }}
                spellCheck={false}
                inputMode="text"
                aria-label="Divider color hex value"
              />
            </div>
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              Used for the divider line and the drag rail background.
            </p>
          </div>
        </div>

        <div className="grid gap-2 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4">
          <div>
            <p className="paper-label mb-1">Authoring sidebar</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Controls whether book chapter trees start collapsed when the authoring desk loads.
            </p>
          </div>

          <label
            htmlFor="general-collapse-book-chapters"
            className="flex items-center justify-between gap-4 rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.82)] px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-[var(--paper-ink)]">
                Collapse book chapters by default
              </p>
              <p className="text-sm text-[var(--paper-muted)]">
                The active book still expands automatically when you open one of its pages.
              </p>
            </div>
            <input
              id="general-collapse-book-chapters"
              type="checkbox"
              className="h-5 w-5 accent-[var(--paper-accent)]"
              checked={collapseBookChaptersByDefault}
              onChange={(event) =>
                setCollapseBookChaptersByDefault(event.target.checked)
              }
            />
          </label>
        </div>

        <div className="grid gap-4 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4">
          <div>
            <p className="paper-label mb-1">Layout widths</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Sets the default widths for the authoring desk columns and the public reading side panels.
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-app-sidebar-width">
              Authoring sidebar width
            </label>
            <input
              id="general-app-sidebar-width"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.appSidebarWidth.min}
              max={GENERAL_SETTINGS_LIMITS.appSidebarWidth.max}
              step={GENERAL_SETTINGS_LIMITS.appSidebarWidth.step}
              value={appSidebarWidth}
              onChange={(event) => setAppSidebarWidth(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">{appSidebarWidth}px</p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-app-inspector-width">
              Authoring inspector width
            </label>
            <input
              id="general-app-inspector-width"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.appInspectorWidth.min}
              max={GENERAL_SETTINGS_LIMITS.appInspectorWidth.max}
              step={GENERAL_SETTINGS_LIMITS.appInspectorWidth.step}
              value={appInspectorWidth}
              onChange={(event) => setAppInspectorWidth(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">{appInspectorWidth}px</p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-public-left-panel-width">
              Public left panel width
            </label>
            <input
              id="general-public-left-panel-width"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.min}
              max={GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.max}
              step={GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.step}
              value={publicLeftPanelWidth}
              onChange={(event) => setPublicLeftPanelWidth(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {publicLeftPanelWidth}px
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-public-right-panel-width">
              Public right panel width
            </label>
            <input
              id="general-public-right-panel-width"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.publicRightPanelWidth.min}
              max={GENERAL_SETTINGS_LIMITS.publicRightPanelWidth.max}
              step={GENERAL_SETTINGS_LIMITS.publicRightPanelWidth.step}
              value={publicRightPanelWidth}
              onChange={(event) => setPublicRightPanelWidth(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {publicRightPanelWidth}px
            </p>
          </div>
        </div>

        <div className="grid gap-4 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4">
          <div>
            <p className="paper-label mb-1">MathJax styling</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Controls equation size and color directly. Font family uses MathJax output fonts and reloads once when changed.
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-math-font-size">
              Equation font size
            </label>
            <input
              id="general-math-font-size"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.mathFontSize.min}
              max={GENERAL_SETTINGS_LIMITS.mathFontSize.max}
              step={GENERAL_SETTINGS_LIMITS.mathFontSize.step}
              value={mathFontSize}
              onChange={(event) => setMathFontSize(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {mathFontSize.toFixed(2)}x
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-math-inline-vertical-align">
              Inline equation baseline offset
            </label>
            <input
              id="general-math-inline-vertical-align"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.mathInlineVerticalAlign.min}
              max={GENERAL_SETTINGS_LIMITS.mathInlineVerticalAlign.max}
              step={GENERAL_SETTINGS_LIMITS.mathInlineVerticalAlign.step}
              value={mathInlineVerticalAlign}
              onChange={(event) => setMathInlineVerticalAlign(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {mathInlineVerticalAlign.toFixed(2)}em
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-math-inline-translate-y">
              Inline equation vertical nudge
            </label>
            <input
              id="general-math-inline-translate-y"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.mathInlineTranslateY.min}
              max={GENERAL_SETTINGS_LIMITS.mathInlineTranslateY.max}
              step={GENERAL_SETTINGS_LIMITS.mathInlineTranslateY.step}
              value={mathInlineTranslateY}
              onChange={(event) => setMathInlineTranslateY(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {mathInlineTranslateY.toFixed(2)}em
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <label className="paper-label" htmlFor="general-math-font-family">
                Equation font family
              </label>
              <select
                id="general-math-font-family"
                className="paper-select"
                value={mathFontFamily}
                onChange={(event) =>
                  setMathFontFamily(event.target.value as GeneralSettings["mathFontFamily"])
                }
              >
                {mathJaxFontOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-[var(--paper-muted)]">
                Compare the current font on the right before saving. Saving still reloads once to update the app-wide MathJax runtime.
              </p>
            </div>
            <div className="grid gap-2">
              <p className="paper-label mb-0">Preview</p>
              <iframe
                title="Math font preview"
                srcDoc={mathPreviewDoc}
                className="h-[220px] w-full rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.92)]"
              />
            </div>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-math-font-color">
              Equation color
            </label>
            <div className="flex items-center gap-3">
              <input
                id="general-math-font-color"
                type="color"
                className="h-11 w-14 cursor-pointer rounded-[14px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.92)] p-1"
                value={mathFontColor}
                onChange={(event) => {
                  setMathFontColor(event.target.value);
                  setMathFontColorInput(event.target.value);
                }}
              />
              <input
                type="text"
                inputMode="text"
                spellCheck={false}
                className="paper-input max-w-[180px]"
                value={mathFontColorInput}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  setMathFontColorInput(nextValue);
                  if (HEX_COLOR_PATTERN.test(nextValue)) {
                    setMathFontColor(nextValue);
                  }
                }}
                placeholder="#201c18"
                aria-label="Equation color hex value"
              />
            </div>
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              Use a hex value like <code>#201c18</code>.
            </p>
          </div>
        </div>

        <div className="grid gap-4 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.46)] p-4">
          <div>
            <p className="paper-label mb-1">Upload limits</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              Controls the maximum accepted sizes for editor uploads. Folder uploads are compressed to a zip archive first, then checked against the file upload limit.
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-image-upload-limit">
              Image upload limit
            </label>
            <input
              id="general-image-upload-limit"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.imageUploadLimitMb.min}
              max={GENERAL_SETTINGS_LIMITS.imageUploadLimitMb.max}
              step={GENERAL_SETTINGS_LIMITS.imageUploadLimitMb.step}
              value={imageUploadLimitMb}
              onChange={(event) => setImageUploadLimitMb(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">{imageUploadLimitMb}MB</p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-file-upload-limit">
              File and folder upload limit
            </label>
            <input
              id="general-file-upload-limit"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.fileUploadLimitMb.min}
              max={GENERAL_SETTINGS_LIMITS.fileUploadLimitMb.max}
              step={GENERAL_SETTINGS_LIMITS.fileUploadLimitMb.step}
              value={fileUploadLimitMb}
              onChange={(event) => setFileUploadLimitMb(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">{fileUploadLimitMb}MB</p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-workspace-transfer-limit">
              Workspace transfer archive limit
            </label>
            <input
              id="general-workspace-transfer-limit"
              type="range"
              min={GENERAL_SETTINGS_LIMITS.workspaceTransferLimitMb.min}
              max={GENERAL_SETTINGS_LIMITS.workspaceTransferLimitMb.max}
              step={GENERAL_SETTINGS_LIMITS.workspaceTransferLimitMb.step}
              value={workspaceTransferLimitMb}
              onChange={(event) =>
                setWorkspaceTransferLimitMb(Number(event.target.value))
              }
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {workspaceTransferLimitMb}MB
            </p>
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              Caps the zip size accepted for workspace imports and the total
              workspace size allowed for exports.
            </p>
          </div>
        </div>

        <p className="text-sm text-[var(--paper-muted)]">{message}</p>
      </div>
    </section>
  );
}
