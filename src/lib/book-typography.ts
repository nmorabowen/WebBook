import type { CSSProperties } from "react";

export type BookTypography = {
  bodyFontSize: number;
  bodyLineHeight: number;
  headingBaseSize: number;
  headingScale: number;
  headingIndentStep: number;
  paragraphSpacing: number;
  contentWidth: number;
  codeBlockFontSize: number;
  codeBlockPaddingY: number;
  codeBlockPaddingX: number;
  codeBlockInsetLeft: number;
  codeBlockInsetRight: number;
};

export const bookTypographyLimits = {
  bodyFontSize: { min: 0.9, max: 1.6, step: 0.02 },
  bodyLineHeight: { min: 1.05, max: 2.4, step: 0.05 },
  headingBaseSize: { min: 1.4, max: 5, step: 0.05 },
  headingScale: { min: 1.05, max: 1.8, step: 0.05 },
  headingIndentStep: { min: 0, max: 3, step: 0.05 },
  paragraphSpacing: { min: 0.5, max: 2.4, step: 0.05 },
  contentWidth: { min: 32, max: 180, step: 1 },
  codeBlockFontSize: { min: 0.6, max: 1.1, step: 0.02 },
  codeBlockPaddingY: { min: 0, max: 2, step: 0.05 },
  codeBlockPaddingX: { min: 0.3, max: 2.4, step: 0.05 },
  codeBlockInsetLeft: { min: 0, max: 4, step: 0.05 },
  codeBlockInsetRight: { min: 0, max: 4, step: 0.05 },
} as const;

export const defaultBookTypography: BookTypography = {
  bodyFontSize: 1.08,
  bodyLineHeight: 1.9,
  headingBaseSize: 3.7,
  headingScale: 1.35,
  headingIndentStep: 0,
  paragraphSpacing: 1,
  contentWidth: 46,
  codeBlockFontSize: 0.78,
  codeBlockPaddingY: 0.55,
  codeBlockPaddingX: 0.9,
  codeBlockInsetLeft: 0,
  codeBlockInsetRight: 0,
};

export const defaultNoteTypography: BookTypography = {
  bodyFontSize: 1,
  bodyLineHeight: 1.05,
  headingBaseSize: 2.5,
  headingScale: 1.25,
  headingIndentStep: 0,
  paragraphSpacing: 1,
  contentWidth: 75,
  codeBlockFontSize: 0.78,
  codeBlockPaddingY: 0.55,
  codeBlockPaddingX: 0.9,
  codeBlockInsetLeft: 0,
  codeBlockInsetRight: 0,
};

export function normalizeBookTypography(
  input?: Partial<BookTypography> | null,
  fallbackTypography: BookTypography = defaultBookTypography,
): BookTypography {
  const contentWidth = Number(input?.contentWidth ?? fallbackTypography.contentWidth);
  return {
    bodyFontSize: Math.max(
      bookTypographyLimits.bodyFontSize.min,
      Math.min(
        bookTypographyLimits.bodyFontSize.max,
        Number(input?.bodyFontSize ?? fallbackTypography.bodyFontSize),
      ),
    ),
    bodyLineHeight: Math.max(
      bookTypographyLimits.bodyLineHeight.min,
      Math.min(
        bookTypographyLimits.bodyLineHeight.max,
        Number(input?.bodyLineHeight ?? fallbackTypography.bodyLineHeight),
      ),
    ),
    headingBaseSize: Math.max(
      bookTypographyLimits.headingBaseSize.min,
      Math.min(
        bookTypographyLimits.headingBaseSize.max,
        Number(input?.headingBaseSize ?? fallbackTypography.headingBaseSize),
      ),
    ),
    headingScale: Math.max(
      bookTypographyLimits.headingScale.min,
      Math.min(
        bookTypographyLimits.headingScale.max,
        Number(input?.headingScale ?? fallbackTypography.headingScale),
      ),
    ),
    headingIndentStep: Math.max(
      bookTypographyLimits.headingIndentStep.min,
      Math.min(
        bookTypographyLimits.headingIndentStep.max,
        Number(input?.headingIndentStep ?? fallbackTypography.headingIndentStep),
      ),
    ),
    paragraphSpacing: Math.max(
      bookTypographyLimits.paragraphSpacing.min,
      Math.min(
        bookTypographyLimits.paragraphSpacing.max,
        Number(input?.paragraphSpacing ?? fallbackTypography.paragraphSpacing),
      ),
    ),
    contentWidth: Math.max(
      bookTypographyLimits.contentWidth.min,
      Math.min(
        bookTypographyLimits.contentWidth.max,
        Number.isFinite(contentWidth) ? contentWidth : fallbackTypography.contentWidth,
      ),
    ),
    codeBlockFontSize: Math.max(
      bookTypographyLimits.codeBlockFontSize.min,
      Math.min(
        bookTypographyLimits.codeBlockFontSize.max,
        Number(input?.codeBlockFontSize ?? fallbackTypography.codeBlockFontSize),
      ),
    ),
    codeBlockPaddingY: Math.max(
      bookTypographyLimits.codeBlockPaddingY.min,
      Math.min(
        bookTypographyLimits.codeBlockPaddingY.max,
        Number(input?.codeBlockPaddingY ?? fallbackTypography.codeBlockPaddingY),
      ),
    ),
    codeBlockPaddingX: Math.max(
      bookTypographyLimits.codeBlockPaddingX.min,
      Math.min(
        bookTypographyLimits.codeBlockPaddingX.max,
        Number(input?.codeBlockPaddingX ?? fallbackTypography.codeBlockPaddingX),
      ),
    ),
    codeBlockInsetLeft: Math.max(
      bookTypographyLimits.codeBlockInsetLeft.min,
      Math.min(
        bookTypographyLimits.codeBlockInsetLeft.max,
        Number(input?.codeBlockInsetLeft ?? fallbackTypography.codeBlockInsetLeft),
      ),
    ),
    codeBlockInsetRight: Math.max(
      bookTypographyLimits.codeBlockInsetRight.min,
      Math.min(
        bookTypographyLimits.codeBlockInsetRight.max,
        Number(input?.codeBlockInsetRight ?? fallbackTypography.codeBlockInsetRight),
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
    "--book-code-size": `${typography.codeBlockFontSize}rem`,
    "--book-code-pad-y": `${typography.codeBlockPaddingY}rem`,
    "--book-code-pad-x": `${typography.codeBlockPaddingX}rem`,
    "--book-code-inset-left": `${typography.codeBlockInsetLeft}rem`,
    "--book-code-inset-right": `${typography.codeBlockInsetRight}rem`,
  };
}
