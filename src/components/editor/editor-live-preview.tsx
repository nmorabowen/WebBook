"use client";

import { useLayoutEffect, useRef } from "react";
import {
  PublicRenderContent,
  type PreviewChapterItem,
  type SourceNavigationRequest,
} from "@/components/public-render-content";
import type { BookTypography } from "@/lib/book-typography";
import type { GeneralSettings, ManifestEntry } from "@/lib/content/schemas";
import type { FontPreset } from "@/lib/font-presets";

type EditorLivePreviewProps = {
  mode: "book" | "note" | "chapter";
  topOffset: number;
  title: string;
  summary?: string;
  markdown: string;
  manifest: ManifestEntry[];
  pageId: string;
  allowExecution?: boolean;
  fontPreset?: FontPreset;
  typography?: Partial<BookTypography>;
  generalSettings?: GeneralSettings;
  backlinks: ManifestEntry[];
  updatedAt?: string;
  revisions: string[];
  currentRoute?: string;
  bookTitle?: string;
  chapterNumber?: string;
  bookSlug?: string;
  chapters?: PreviewChapterItem[];
  sourceNavigationRequest?: SourceNavigationRequest | null;
  onRequestSourceLine?: (line: number) => void;
  onVisibleSourceLineChange?: (line: number) => void;
  onSourceNavigationHandled?: (request: SourceNavigationRequest, actualLine: number) => void;
};

export function EditorLivePreview({
  mode,
  topOffset,
  title,
  summary,
  markdown,
  manifest,
  pageId,
  allowExecution = false,
  fontPreset = "source-serif",
  typography,
  generalSettings,
  currentRoute,
  bookTitle,
  chapterNumber,
  bookSlug,
  chapters = [],
  sourceNavigationRequest,
  onRequestSourceLine,
  onVisibleSourceLineChange,
  onSourceNavigationHandled,
}: EditorLivePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef({ top: 0, left: 0 });
  const lastNavigationNonceRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const navigationNonce = sourceNavigationRequest?.nonce ?? null;
    if (navigationNonce !== null && navigationNonce !== lastNavigationNonceRef.current) {
      lastNavigationNonceRef.current = navigationNonce;
      return;
    }

    viewport.scrollTop = scrollPositionRef.current.top;
    viewport.scrollLeft = scrollPositionRef.current.left;
  }, [fontPreset, markdown, sourceNavigationRequest?.nonce, summary, title, topOffset, typography]);

  return (
    <div
      ref={viewportRef}
      className="editor-preview pr-1"
      data-font-preset={fontPreset}
      onScroll={(event) => {
        scrollPositionRef.current = {
          top: event.currentTarget.scrollTop,
          left: event.currentTarget.scrollLeft,
        };
      }}
    >
      <div
        className="editor-preview-offset"
        aria-hidden="true"
        style={{ height: `${topOffset}px` }}
      />
      <main
        className="paper-panel paper-panel-strong p-6 md:p-10"
        style={{ borderRadius: "var(--workspace-corner-radius)" }}
      >
        <PublicRenderContent
          mode={mode}
          title={title}
          summary={summary}
          markdown={markdown}
          manifest={manifest}
          pageId={pageId}
          requester="admin"
          allowExecution={allowExecution}
          fontPreset={fontPreset}
          typography={typography}
          generalSettings={generalSettings}
          bookTitle={bookTitle}
          chapterNumber={chapterNumber}
          bookSlug={bookSlug}
          chapters={chapters}
          sourceNavigation
          currentRoute={currentRoute}
          sourceNavigationViewportRef={viewportRef}
          sourceNavigationRequest={sourceNavigationRequest}
          onRequestSourceLine={onRequestSourceLine}
          onVisibleSourceLineChange={onVisibleSourceLineChange}
          onSourceNavigationHandled={onSourceNavigationHandled}
          linkTarget="_blank"
          linkRel="noreferrer"
        />
      </main>
    </div>
  );
}
