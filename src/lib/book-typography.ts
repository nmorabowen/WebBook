import type { CSSProperties } from "react";

export type BookTypography = {
  bodyFontSize: number;
  bodyLineHeight: number;
  headingBaseSize: number;
  headingScale: number;
  headingIndentStep: number;
  paragraphSpacing: number;
  contentWidth: number;
};

export const defaultBookTypography: BookTypography = {
  bodyFontSize: 1.08,
  bodyLineHeight: 1.9,
  headingBaseSize: 3.7,
  headingScale: 1.35,
  headingIndentStep: 0,
  paragraphSpacing: 1,
  contentWidth: 46,
};

export function normalizeBookTypography(
  input?: Partial<BookTypography> | null,
): BookTypography {
  return {
    bodyFontSize: input?.bodyFontSize ?? defaultBookTypography.bodyFontSize,
    bodyLineHeight: input?.bodyLineHeight ?? defaultBookTypography.bodyLineHeight,
    headingBaseSize: input?.headingBaseSize ?? defaultBookTypography.headingBaseSize,
    headingScale: input?.headingScale ?? defaultBookTypography.headingScale,
    headingIndentStep:
      input?.headingIndentStep ?? defaultBookTypography.headingIndentStep,
    paragraphSpacing:
      input?.paragraphSpacing ?? defaultBookTypography.paragraphSpacing,
    contentWidth: input?.contentWidth ?? defaultBookTypography.contentWidth,
  };
}

export function bookTypographyStyle(
  input?: Partial<BookTypography> | null,
): CSSProperties & Record<string, string> {
  const typography = normalizeBookTypography(input);
  const h1 = typography.headingBaseSize;
  const h2 = h1 / typography.headingScale;
  const h3 = h2 / typography.headingScale;
  const h4 = h3 / typography.headingScale;

  return {
    "--book-body-size": `${typography.bodyFontSize}rem`,
    "--book-body-line-height": `${typography.bodyLineHeight}`,
    "--book-h1-size": `${h1}rem`,
    "--book-h2-size": `${h2}rem`,
    "--book-h3-size": `${h3}rem`,
    "--book-h4-size": `${h4}rem`,
    "--book-heading-indent-step": `${typography.headingIndentStep}rem`,
    "--book-block-spacing": `${typography.paragraphSpacing}rem`,
    "--book-content-width": `${typography.contentWidth}rem`,
  };
}
