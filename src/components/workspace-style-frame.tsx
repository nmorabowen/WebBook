"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { GeneralSettings } from "@/lib/content/schemas";
import { colorThemePresets } from "@/lib/color-themes";
import { DEFAULT_GENERAL_SETTINGS } from "@/lib/general-settings-config";
import {
  GENERAL_SETTINGS_EVENT,
  GENERAL_SETTINGS_STORAGE_KEY,
  isDefaultGeneralSettings,
  normalizeGeneralSettings,
  readStoredGeneralSettings,
} from "@/lib/general-settings";

function resolvePreferredSettings(
  incoming?: GeneralSettings,
  stored?: GeneralSettings | null,
) {
  if (
    stored &&
    (!incoming ||
      (isDefaultGeneralSettings(incoming) && !isDefaultGeneralSettings(stored)))
  ) {
    return stored;
  }

  return normalizeGeneralSettings(incoming ?? stored ?? DEFAULT_GENERAL_SETTINGS);
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
    resolvePreferredSettings(generalSettings, readStoredGeneralSettings()),
  );

  useEffect(() => {
    setResolvedSettings(resolvePreferredSettings(generalSettings, readStoredGeneralSettings()));
  }, [
    generalSettings?.colorTheme,
    generalSettings?.cornerRadius,
    generalSettings?.tileSpacing,
    generalSettings?.collapseBookChaptersByDefault,
    generalSettings?.mathFontSize,
    generalSettings?.mathFontColor,
    generalSettings?.mathFontFamily,
    generalSettings?.appSidebarWidth,
    generalSettings?.appInspectorWidth,
    generalSettings?.publicLeftPanelWidth,
    generalSettings?.publicRightPanelWidth,
  ]);

  useEffect(() => {
    const handleSettingsEvent = (event: Event) => {
      const detail = (event as CustomEvent<GeneralSettings>).detail;
      setResolvedSettings(resolvePreferredSettings(detail, detail));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== GENERAL_SETTINGS_STORAGE_KEY) {
        return;
      }

      setResolvedSettings(
        resolvePreferredSettings(generalSettings, readStoredGeneralSettings()),
      );
    };

    window.addEventListener(GENERAL_SETTINGS_EVENT, handleSettingsEvent as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        GENERAL_SETTINGS_EVENT,
        handleSettingsEvent as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [generalSettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        GENERAL_SETTINGS_STORAGE_KEY,
        JSON.stringify(resolvedSettings),
      );
    } catch {}
  }, [resolvedSettings]);

  useEffect(() => {
    const root = document.documentElement;
    const palette = colorThemePresets[resolvedSettings.colorTheme];
    const entries = [
      ["--paper-cream", palette.cream],
      ["--paper-ink", palette.ink],
      ["--paper-muted", palette.muted],
      ["--paper-border", palette.border],
      ["--paper-accent", palette.accent],
      ["--paper-accent-soft", palette.accentSoft],
      ["--paper-panel", palette.panel],
      ["--paper-panel-strong", palette.panelStrong],
      ["--paper-code", palette.code],
      ["--paper-code-text", palette.codeText],
      ["--paper-success", palette.success],
      ["--paper-danger", palette.danger],
    ] as const;

    for (const [name, value] of entries) {
      root.style.setProperty(name, value);
    }
  }, [resolvedSettings.colorTheme]);

  const style = {
    "--paper-cream": colorThemePresets[resolvedSettings.colorTheme].cream,
    "--paper-ink": colorThemePresets[resolvedSettings.colorTheme].ink,
    "--paper-muted": colorThemePresets[resolvedSettings.colorTheme].muted,
    "--paper-border": colorThemePresets[resolvedSettings.colorTheme].border,
    "--paper-accent": colorThemePresets[resolvedSettings.colorTheme].accent,
    "--paper-accent-soft": colorThemePresets[resolvedSettings.colorTheme].accentSoft,
    "--paper-panel": colorThemePresets[resolvedSettings.colorTheme].panel,
    "--paper-panel-strong": colorThemePresets[resolvedSettings.colorTheme].panelStrong,
    "--paper-code": colorThemePresets[resolvedSettings.colorTheme].code,
    "--paper-code-text": colorThemePresets[resolvedSettings.colorTheme].codeText,
    "--paper-success": colorThemePresets[resolvedSettings.colorTheme].success,
    "--paper-danger": colorThemePresets[resolvedSettings.colorTheme].danger,
    "--workspace-corner-radius": `${resolvedSettings.cornerRadius}px`,
    "--workspace-radius-panel": `${resolvedSettings.cornerRadius}px`,
    "--workspace-radius-lg": `${Math.max(resolvedSettings.cornerRadius - 4, 0)}px`,
    "--workspace-radius-md": `${Math.max(resolvedSettings.cornerRadius - 8, 0)}px`,
    "--workspace-radius-sm": `${Math.max(resolvedSettings.cornerRadius - 10, 0)}px`,
    "--workspace-radius-xs": `${Math.max(resolvedSettings.cornerRadius - 14, 0)}px`,
    "--workspace-tile-spacing": `${resolvedSettings.tileSpacing}rem`,
    "--workspace-math-font-size": `${resolvedSettings.mathFontSize}em`,
    "--workspace-math-color": resolvedSettings.mathFontColor,
    "--workspace-app-sidebar-width": `${resolvedSettings.appSidebarWidth}px`,
    "--workspace-app-inspector-width": `${resolvedSettings.appInspectorWidth}px`,
    "--workspace-public-left-panel-width": `${resolvedSettings.publicLeftPanelWidth}px`,
    "--workspace-public-right-panel-width": `${resolvedSettings.publicRightPanelWidth}px`,
  } as CSSProperties;

  return <div style={style}>{children}</div>;
}
