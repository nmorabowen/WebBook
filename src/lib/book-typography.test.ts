import { describe, expect, it } from "vitest";
import {
  bookTypographyLimits,
  defaultBookTypography,
  defaultNoteTypography,
} from "./book-typography";

describe("typography defaults", () => {
  it("keeps default book typography inside validation limits", () => {
    expect(defaultBookTypography.bodyFontSize).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyFontSize.min,
    );
    expect(defaultBookTypography.bodyLineHeight).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyLineHeight.min,
    );
  });

  it("keeps default note typography inside validation limits", () => {
    expect(defaultNoteTypography.bodyFontSize).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyFontSize.min,
    );
    expect(defaultNoteTypography.bodyLineHeight).toBeGreaterThanOrEqual(
      bookTypographyLimits.bodyLineHeight.min,
    );
  });
});
