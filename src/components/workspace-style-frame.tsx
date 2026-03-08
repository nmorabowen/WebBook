"use client";

import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
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

function subscribeToGeneralSettings(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleSettingsChange = () => {
    onStoreChange();
  };

  window.addEventListener(GENERAL_SETTINGS_EVENT, handleSettingsChange as EventListener);
  window.addEventListener("storage", handleSettingsChange);

  return () => {
    window.removeEventListener(
      GENERAL_SETTINGS_EVENT,
      handleSettingsChange as EventListener,
    );
    window.removeEventListener("storage", handleSettingsChange);
  };
}

function getStoredGeneralSettingsSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY);
}

export function WorkspaceStyleFrame({
  generalSettings,
  children,
}: WorkspaceStyleFrameProps) {
  const storedSettingsSnapshot = useSyncExternalStore(
    subscribeToGeneralSettings,
    getStoredGeneralSettingsSnapshot,
    () => null,
  );
  const resolvedSettings = useMemo(
    () =>
      resolvePreferredSettings(
        generalSettings,
        storedSettingsSnapshot ? readStoredGeneralSettings() : null,
      ),
    [generalSettings, storedSettingsSnapshot],
  );

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
    "--workspace-divider-spacing": `${resolvedSettings.dividerSpacing}px`,
    "--workspace-divider-color": resolvedSettings.dividerColor,
    "--workspace-divider-width": `${resolvedSettings.dividerWidth}px`,
    "--workspace-divider-background-size": `${resolvedSettings.dividerBackgroundSize}px`,
    "--workspace-math-font-size": `${resolvedSettings.mathFontSize}em`,
    "--workspace-math-color": resolvedSettings.mathFontColor,
    "--workspace-math-inline-vertical-align": `${resolvedSettings.mathInlineVerticalAlign}em`,
    "--workspace-math-inline-translate-y": `${resolvedSettings.mathInlineTranslateY}em`,
    "--workspace-app-sidebar-width": `${resolvedSettings.appSidebarWidth}px`,
    "--workspace-app-sidebar-width-effective": `clamp(240px, 20vw, ${Math.max(
      resolvedSettings.appSidebarWidth,
      260,
    )}px)`,
    "--workspace-app-inspector-width": `${resolvedSettings.appInspectorWidth}px`,
    "--workspace-app-inspector-width-effective": `clamp(320px, 24vw, ${Math.max(
      resolvedSettings.appInspectorWidth,
      360,
    )}px)`,
    "--workspace-public-left-panel-width": `${resolvedSettings.publicLeftPanelWidth}px`,
    "--workspace-public-right-panel-width": `${resolvedSettings.publicRightPanelWidth}px`,
  } as CSSProperties;

  return <div style={style}>{children}</div>;
}
