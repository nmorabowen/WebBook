import type { ColorThemePreset } from "@/lib/color-themes";

export const GENERAL_SETTINGS_LIMITS = {
  cornerRadius: { min: 0, max: 40, step: 1 },
  tileSpacing: { min: 0.15, max: 2.5, step: 0.05 },
  mathFontSize: { min: 0.8, max: 2.5, step: 0.05 },
  appSidebarWidth: { min: 220, max: 360, step: 4 },
  appInspectorWidth: { min: 260, max: 480, step: 4 },
  publicLeftPanelWidth: { min: 220, max: 460, step: 4 },
  publicRightPanelWidth: { min: 220, max: 460, step: 4 },
} as const;

export const DEFAULT_GENERAL_SETTINGS = {
  colorTheme: "paper" as ColorThemePreset,
  cornerRadius: 28,
  tileSpacing: 1.5,
  collapseBookChaptersByDefault: true,
  mathFontSize: 1,
  mathFontColor: "#201c18",
  mathFontFamily: "mathjax-newcm",
  appSidebarWidth: 280,
  appInspectorWidth: 300,
  publicLeftPanelWidth: 260,
  publicRightPanelWidth: 260,
} as const;
