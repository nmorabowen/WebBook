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

export const bookTypographyLimits = {
  bodyFontSize: { min: 0.9, max: 1.6, step: 0.02 },
  bodyLineHeight: { min: 1.05, max: 2.4, step: 0.05 },
  headingBaseSize: { min: 1.4, max: 5, step: 0.05 },
  headingScale: { min: 1.05, max: 1.8, step: 0.05 },
  headingIndentStep: { min: 0, max: 3, step: 0.05 },
  paragraphSpacing: { min: 0.5, max: 2.4, step: 0.05 },
  contentWidth: { min: 32, max: 180, step: 1 },
} as const;

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
  const contentWidth = Number(input?.contentWidth ?? defaultBookTypography.contentWidth);
  return {
    bodyFontSize: Math.max(
      bookTypographyLimits.bodyFontSize.min,
      Math.min(
        bookTypographyLimits.bodyFontSize.max,
        Number(input?.bodyFontSize ?? defaultBookTypography.bodyFontSize),
      ),
    ),
    bodyLineHeight: Math.max(
      bookTypographyLimits.bodyLineHeight.min,
      Math.min(
        bookTypographyLimits.bodyLineHeight.max,
        Number(input?.bodyLineHeight ?? defaultBookTypography.bodyLineHeight),
      ),
    ),
    headingBaseSize: Math.max(
      bookTypographyLimits.headingBaseSize.min,
      Math.min(
        bookTypographyLimits.headingBaseSize.max,
        Number(input?.headingBaseSize ?? defaultBookTypography.headingBaseSize),
      ),
    ),
    headingScale: Math.max(
      bookTypographyLimits.headingScale.min,
      Math.min(
        bookTypographyLimits.headingScale.max,
        Number(input?.headingScale ?? defaultBookTypography.headingScale),
      ),
    ),
    headingIndentStep: Math.max(
      bookTypographyLimits.headingIndentStep.min,
      Math.min(
        bookTypographyLimits.headingIndentStep.max,
        Number(input?.headingIndentStep ?? defaultBookTypography.headingIndentStep),
      ),
    ),
    paragraphSpacing: Math.max(
      bookTypographyLimits.paragraphSpacing.min,
      Math.min(
        bookTypographyLimits.paragraphSpacing.max,
        Number(input?.paragraphSpacing ?? defaultBookTypography.paragraphSpacing),
      ),
    ),
    contentWidth: Math.max(
      bookTypographyLimits.contentWidth.min,
      Math.min(
        bookTypographyLimits.contentWidth.max,
        Number.isFinite(contentWidth) ? contentWidth : defaultBookTypography.contentWidth,
      ),
    ),
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
    "--book-content-width": `${typography.contentWidth}ch`,
  };
}
