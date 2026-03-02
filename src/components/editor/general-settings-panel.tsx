"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { GeneralSettings } from "@/lib/content/schemas";
import { mathJaxFontOptions } from "@/lib/mathjax-fonts";

const STORAGE_KEY = "webbook.general-settings";
const SETTINGS_EVENT = "webbook-general-settings";
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

type GeneralSettingsPanelProps = {
  initialSettings: GeneralSettings;
};

export function GeneralSettingsPanel({
  initialSettings,
}: GeneralSettingsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
  const [message, setMessage] = useState("Saved to the workspace.");

  const save = () => {
    startTransition(async () => {
      const nextSettings = {
        cornerRadius,
        tileSpacing,
        collapseBookChaptersByDefault,
        mathFontSize,
        mathFontColor,
        mathFontFamily,
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
        return;
      }

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
        window.dispatchEvent(
          new CustomEvent<GeneralSettings>(SETTINGS_EVENT, {
            detail: nextSettings,
          }),
        );
      } catch {}

      setMessage("Workspace settings saved.");
      if (mathFontFamily !== initialSettings.mathFontFamily) {
        window.location.reload();
        return;
      }

      router.refresh();
    });
  };

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
        <div>
          <label className="paper-label" htmlFor="general-corner-radius">
            Rounded corners
          </label>
          <input
            id="general-corner-radius"
            type="range"
            min={0}
            max={40}
            step={1}
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
            min={0.15}
            max={2.5}
            step={0.05}
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
              min={0.8}
              max={2.5}
              step={0.05}
              value={mathFontSize}
              onChange={(event) => setMathFontSize(Number(event.target.value))}
            />
            <p className="mt-2 text-sm text-[var(--paper-muted)]">
              {mathFontSize.toFixed(2)}x
            </p>
          </div>

          <div>
            <label className="paper-label" htmlFor="general-math-font-family">
              Equation font family
            </label>
            <select
              id="general-math-font-family"
              className="paper-select"
              value={mathFontFamily}
              onChange={(event) => setMathFontFamily(event.target.value as GeneralSettings["mathFontFamily"])}
            >
              {mathJaxFontOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--paper-muted)]">{message}</p>
          <button
            type="button"
            className="paper-button"
            onClick={save}
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>
    </section>
  );
}
