import type { CSSProperties, ReactNode } from "react";
import type { GeneralSettings } from "@/lib/content/schemas";
import { colorThemePresets } from "@/lib/color-themes";
import { DEFAULT_GENERAL_SETTINGS } from "@/lib/general-settings-config";
import { normalizeGeneralSettings } from "@/lib/general-settings";

type PublicStyleFrameProps = {
  generalSettings?: GeneralSettings;
  children: ReactNode;
};

export function PublicStyleFrame({
  generalSettings,
  children,
}: PublicStyleFrameProps) {
  const resolvedSettings = normalizeGeneralSettings(
    generalSettings ?? DEFAULT_GENERAL_SETTINGS,
  );
  const palette = colorThemePresets[resolvedSettings.colorTheme];
  const style = {
    "--paper-cream": palette.cream,
    "--paper-ink": palette.ink,
    "--paper-muted": palette.muted,
    "--paper-border": palette.border,
    "--paper-accent": palette.accent,
    "--paper-accent-soft": palette.accentSoft,
    "--paper-panel": palette.panel,
    "--paper-panel-strong": palette.panelStrong,
    "--paper-code": palette.code,
    "--paper-code-text": palette.codeText,
    "--paper-success": palette.success,
    "--paper-danger": palette.danger,
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
    "--workspace-public-left-panel-width": `${resolvedSettings.publicLeftPanelWidth}px`,
    "--workspace-public-right-panel-width": `${resolvedSettings.publicRightPanelWidth}px`,
  } as CSSProperties;

  return <div style={style}>{children}</div>;
}
