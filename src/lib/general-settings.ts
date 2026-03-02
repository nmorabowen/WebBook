import type { GeneralSettings } from "@/lib/content/schemas";
import { colorThemeValues } from "@/lib/color-themes";
import {
  DEFAULT_GENERAL_SETTINGS,
  GENERAL_SETTINGS_LIMITS,
} from "@/lib/general-settings-config";

export const GENERAL_SETTINGS_STORAGE_KEY = "webbook.general-settings";
export const GENERAL_SETTINGS_EVENT = "webbook-general-settings";

export function normalizeGeneralSettings(
  input?: Partial<GeneralSettings> | null,
): GeneralSettings {
  return {
    colorTheme:
      typeof input?.colorTheme === "string" &&
      colorThemeValues.includes(input.colorTheme as (typeof colorThemeValues)[number])
        ? (input.colorTheme as GeneralSettings["colorTheme"])
        : DEFAULT_GENERAL_SETTINGS.colorTheme,
    cornerRadius: Math.max(
      GENERAL_SETTINGS_LIMITS.cornerRadius.min,
      Math.min(
        GENERAL_SETTINGS_LIMITS.cornerRadius.max,
        Number(input?.cornerRadius ?? DEFAULT_GENERAL_SETTINGS.cornerRadius),
      ),
    ),
    tileSpacing: Math.max(
      GENERAL_SETTINGS_LIMITS.tileSpacing.min,
      Math.min(
        GENERAL_SETTINGS_LIMITS.tileSpacing.max,
        Number(input?.tileSpacing ?? DEFAULT_GENERAL_SETTINGS.tileSpacing),
      ),
    ),
    collapseBookChaptersByDefault:
      typeof input?.collapseBookChaptersByDefault === "boolean"
        ? input.collapseBookChaptersByDefault
        : DEFAULT_GENERAL_SETTINGS.collapseBookChaptersByDefault,
    mathFontSize: Math.max(
      GENERAL_SETTINGS_LIMITS.mathFontSize.min,
      Math.min(
        GENERAL_SETTINGS_LIMITS.mathFontSize.max,
        Number(input?.mathFontSize ?? DEFAULT_GENERAL_SETTINGS.mathFontSize),
      ),
    ),
    mathFontColor:
      typeof input?.mathFontColor === "string" &&
      /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(input.mathFontColor)
        ? input.mathFontColor
        : DEFAULT_GENERAL_SETTINGS.mathFontColor,
    mathFontFamily:
      typeof input?.mathFontFamily === "string" && input.mathFontFamily
        ? input.mathFontFamily
        : DEFAULT_GENERAL_SETTINGS.mathFontFamily,
    appSidebarWidth: Math.max(
      GENERAL_SETTINGS_LIMITS.appSidebarWidth.min,
      Math.min(
        GENERAL_SETTINGS_LIMITS.appSidebarWidth.max,
        Number(input?.appSidebarWidth ?? DEFAULT_GENERAL_SETTINGS.appSidebarWidth),
      ),
    ),
    appInspectorWidth: Math.max(
      GENERAL_SETTINGS_LIMITS.appInspectorWidth.min,
      Math.min(
        GENERAL_SETTINGS_LIMITS.appInspectorWidth.max,
        Number(input?.appInspectorWidth ?? DEFAULT_GENERAL_SETTINGS.appInspectorWidth),
      ),
    ),
    publicLeftPanelWidth: Math.max(
      GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.min,
      Math.min(
        GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.max,
        Number(
          input?.publicLeftPanelWidth ?? DEFAULT_GENERAL_SETTINGS.publicLeftPanelWidth,
        ),
      ),
    ),
    publicRightPanelWidth: Math.max(
      GENERAL_SETTINGS_LIMITS.publicRightPanelWidth.min,
      Math.min(
        GENERAL_SETTINGS_LIMITS.publicRightPanelWidth.max,
        Number(
          input?.publicRightPanelWidth ?? DEFAULT_GENERAL_SETTINGS.publicRightPanelWidth,
        ),
      ),
    ),
  };
}

export function isDefaultGeneralSettings(
  input?: Partial<GeneralSettings> | null,
): boolean {
  const normalized = normalizeGeneralSettings(input);
  return (
    normalized.colorTheme === DEFAULT_GENERAL_SETTINGS.colorTheme &&
    normalized.cornerRadius === DEFAULT_GENERAL_SETTINGS.cornerRadius &&
    normalized.tileSpacing === DEFAULT_GENERAL_SETTINGS.tileSpacing &&
    normalized.collapseBookChaptersByDefault ===
      DEFAULT_GENERAL_SETTINGS.collapseBookChaptersByDefault &&
    normalized.mathFontSize === DEFAULT_GENERAL_SETTINGS.mathFontSize &&
    normalized.mathFontColor === DEFAULT_GENERAL_SETTINGS.mathFontColor &&
    normalized.mathFontFamily === DEFAULT_GENERAL_SETTINGS.mathFontFamily &&
    normalized.appSidebarWidth === DEFAULT_GENERAL_SETTINGS.appSidebarWidth &&
    normalized.appInspectorWidth === DEFAULT_GENERAL_SETTINGS.appInspectorWidth &&
    normalized.publicLeftPanelWidth === DEFAULT_GENERAL_SETTINGS.publicLeftPanelWidth &&
    normalized.publicRightPanelWidth === DEFAULT_GENERAL_SETTINGS.publicRightPanelWidth
  );
}

export function readStoredGeneralSettings(): GeneralSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeGeneralSettings(JSON.parse(raw) as Partial<GeneralSettings>);
  } catch {
    return null;
  }
}
