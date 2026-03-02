"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { GeneralSettings } from "@/lib/content/schemas";

const STORAGE_KEY = "webbook.general-settings";
const SETTINGS_EVENT = "webbook-general-settings";
const defaultGeneralSettings: GeneralSettings = {
  cornerRadius: 28,
  tileSpacing: 1.5,
  collapseBookChaptersByDefault: true,
  mathFontSize: 1,
  mathFontColor: "#201c18",
  mathFontFamily: "mathjax-newcm",
};

function normalizeSettings(input?: Partial<GeneralSettings> | null): GeneralSettings {
  return {
    cornerRadius: Math.max(
      0,
      Math.min(40, Number(input?.cornerRadius ?? defaultGeneralSettings.cornerRadius)),
    ),
    tileSpacing: Math.max(
      0.15,
      Math.min(2.5, Number(input?.tileSpacing ?? defaultGeneralSettings.tileSpacing)),
    ),
    collapseBookChaptersByDefault:
      typeof input?.collapseBookChaptersByDefault === "boolean"
        ? input.collapseBookChaptersByDefault
        : defaultGeneralSettings.collapseBookChaptersByDefault,
    mathFontSize: Math.max(
      0.8,
      Math.min(2.5, Number(input?.mathFontSize ?? defaultGeneralSettings.mathFontSize)),
    ),
    mathFontColor:
      typeof input?.mathFontColor === "string" &&
      /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(input.mathFontColor)
        ? input.mathFontColor
        : defaultGeneralSettings.mathFontColor,
    mathFontFamily:
      typeof input?.mathFontFamily === "string" && input.mathFontFamily
        ? input.mathFontFamily
        : defaultGeneralSettings.mathFontFamily,
  };
}

function readStoredSettings(): GeneralSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeSettings(JSON.parse(raw) as Partial<GeneralSettings>);
  } catch {
    return null;
  }
}

function isDefaultSettings(input?: Partial<GeneralSettings> | null) {
  const normalized = normalizeSettings(input);
  return (
    normalized.cornerRadius === defaultGeneralSettings.cornerRadius &&
    normalized.tileSpacing === defaultGeneralSettings.tileSpacing &&
    normalized.collapseBookChaptersByDefault ===
      defaultGeneralSettings.collapseBookChaptersByDefault &&
    normalized.mathFontSize === defaultGeneralSettings.mathFontSize &&
    normalized.mathFontColor === defaultGeneralSettings.mathFontColor &&
    normalized.mathFontFamily === defaultGeneralSettings.mathFontFamily
  );
}

function resolvePreferredSettings(
  incoming?: GeneralSettings,
  stored?: GeneralSettings | null,
) {
  if (stored && (!incoming || (isDefaultSettings(incoming) && !isDefaultSettings(stored)))) {
    return stored;
  }

  return normalizeSettings(incoming ?? stored ?? defaultGeneralSettings);
}

type WorkspaceStyleFrameProps = {
  generalSettings?: GeneralSettings;
  children: ReactNode;
};

export function WorkspaceStyleFrame({
  generalSettings,
  children,
}: WorkspaceStyleFrameProps) {
  const [resolvedSettings, setResolvedSettings] = useState<GeneralSettings>(() =>
    resolvePreferredSettings(generalSettings, readStoredSettings()),
  );

  useEffect(() => {
    setResolvedSettings(resolvePreferredSettings(generalSettings, readStoredSettings()));
  }, [
    generalSettings?.cornerRadius,
    generalSettings?.tileSpacing,
    generalSettings?.collapseBookChaptersByDefault,
    generalSettings?.mathFontSize,
    generalSettings?.mathFontColor,
    generalSettings?.mathFontFamily,
  ]);

  useEffect(() => {
    const handleSettingsEvent = (event: Event) => {
      const detail = (event as CustomEvent<GeneralSettings>).detail;
      setResolvedSettings(resolvePreferredSettings(detail, detail));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      setResolvedSettings(resolvePreferredSettings(generalSettings, readStoredSettings()));
    };

    window.addEventListener(SETTINGS_EVENT, handleSettingsEvent as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(SETTINGS_EVENT, handleSettingsEvent as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [generalSettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resolvedSettings));
    } catch {}
  }, [resolvedSettings]);

  const style = {
    "--workspace-corner-radius": `${resolvedSettings.cornerRadius}px`,
    "--workspace-tile-spacing": `${resolvedSettings.tileSpacing}rem`,
    "--workspace-math-font-size": `${resolvedSettings.mathFontSize}em`,
    "--workspace-math-color": resolvedSettings.mathFontColor,
  } as CSSProperties;

  return <div style={style}>{children}</div>;
}
