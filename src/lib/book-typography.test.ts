import { describe, expect, it } from "vitest";
import {
  bookTypographyLimits,
  defaultBookTypography,
  defaultNoteTypography,
  normalizeBookTypography,
} from "./book-typography";

describe("typography defaults", () => {
  it("keeps default book typography inside validation limits", () => {
    expect(defaultBookTypography.bodyFontSize).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyFontSize.min,
    );
    expect(defaultBookTypography.bodyLineHeight).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyLineHeight.min,
    );
    expect(defaultBookTypography.codeBlockFontSize).toBeGreaterThanOrEqual(
      bookTypographyLimits.codeBlockFontSize.min,
    );
  });

  it("keeps default note typography inside validation limits", () => {
    expect(defaultNoteTypography.bodyFontSize).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyFontSize.min,
    );
    expect(defaultNoteTypography.bodyLineHeight).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyLineHeight.min,
    );
    expect(defaultNoteTypography.codeBlockFontSize).toBeGreaterThanOrEqual(
      bookTypographyLimits.codeBlockFontSize.min,
    );
  });

  it("fills in missing code block typography from the fallback", () => {
    const typography = normalizeBookTypography({
      bodyFontSize: 1.08,
      bodyLineHeight: 1.9,
      headingBaseSize: 3.7,
      headingScale: 1.35,
      headingIndentStep: 0,
      paragraphSpacing: 1,
      contentWidth: 46,
    });

    expect(typography.codeBlockFontSize).toBe(defaultBookTypography.codeBlockFontSize);
  });
});
