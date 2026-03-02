"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
};

export function GeneralSettingsPanel({
  initialSettings,
}: GeneralSettingsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [colorTheme, setColorTheme] = useState(initialSettings.colorTheme);
  const [cornerRadius, setCornerRadius] = useState(initialSettings.cornerRadius);
  const [tileSpacing, setTileSpacing] = useState(initialSettings.tileSpacing);
  const [collapseBookChaptersByDefault, setCollapseBookChaptersByDefault] = useState(
    initialSettings.collapseBookChaptersByDefault,
  );
  const [mathFontSize, setMathFontSize] = useState(initialSettings.mathFontSize);
  const [mathFontColor, setMathFontColor] = useState(initialSettings.mathFontColor);
  const [mathFontColorInput, setMathFontColorInput] = useState(
    initialSettings.mathFontColor,
  );
  const [mathFontFamily, setMathFontFamily] = useState(initialSettings.mathFontFamily);
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
      mjx-container[jax="SVG"] {
        color: ${mathFontColor};
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
    [mathFontColor, mathFontFamily, mathFontSize],
  );

  const save = () => {
    window.dispatchEvent(
      new CustomEvent(GENERAL_SETTINGS_SAVE_STATUS_EVENT, {
        detail: "saving",
      }),
    );
    startTransition(async () => {
      const nextSettings = {
        colorTheme,
        cornerRadius,
        tileSpacing,
        collapseBookChaptersByDefault,
        mathFontSize,
        mathFontColor,
        mathFontFamily,
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
  };

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
    appInspectorWidth,
    appSidebarWidth,
    collapseBookChaptersByDefault,
    colorTheme,
    cornerRadius,
    initialSettings.mathFontFamily,
    isPending,
    mathFontColor,
    mathFontFamily,
    mathFontSize,
    publicLeftPanelWidth,
    publicRightPanelWidth,
    tileSpacing,
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
        <div className="grid gap-3">
          <p className="paper-label mb-0">Color theme</p>
          <div className="flex flex-wrap gap-3">
            {colorThemeOptions.map((option) => {
              const palette = colorThemePresets[option.value];
              const active = colorTheme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="grid justify-items-center gap-2 text-center"
                  onClick={() => setColorTheme(option.value)}
                  aria-pressed={active}
                  title={option.label}
                >
                  <span
                    className="grid h-12 w-12 place-items-center rounded-full border transition"
                    style={{
                      background: `linear-gradient(135deg, ${palette.cream} 0%, ${palette.panelStrong} 35%, ${palette.accent} 100%)`,
                      borderColor: active ? "var(--paper-ink)" : "var(--paper-border)",
                      boxShadow: active
                        ? "0 0 0 3px rgba(32,28,24,0.12)"
                        : "0 6px 16px rgba(32,28,24,0.08)",
                      transform: active ? "translateY(-1px)" : undefined,
                    }}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: palette.accent }}
                    />
                  </span>
                  <span className="text-xs font-medium text-[var(--paper-muted)]">
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

        <p className="text-sm text-[var(--paper-muted)]">{message}</p>
      </div>
    </section>
  );
}
