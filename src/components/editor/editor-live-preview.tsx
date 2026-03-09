"use client";

import { useRef } from "react";
import {
  PublicRenderContent,
  type PreviewChapterItem,
  type SourceNavigationRequest,
} from "@/components/public-render-content";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";
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
  backlinks,
  updatedAt,
  revisions,
  currentRoute,
  bookTitle,
  chapterNumber,
  bookSlug,
  chapters = [],
  sourceNavigationRequest,
  onRequestSourceLine,
  onVisibleSourceLineChange,
}: EditorLivePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={viewportRef}
      className="editor-preview pr-1"
      data-font-preset={fontPreset}
    >
      <div
        className="editor-preview-offset"
        aria-hidden="true"
        style={{ height: `${topOffset}px` }}
      />
      <div className="paper-grid preview-shell-layout" style={{ gap: "var(--workspace-tile-spacing)" }}>
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
            linkTarget="_blank"
            linkRel="noreferrer"
          />
        </main>
        <aside
          className="paper-panel hidden p-6 xl:block"
          style={{ borderRadius: "var(--workspace-corner-radius)" }}
        >
          <ReadingMetaPanel
            backlinks={backlinks}
            updatedAt={updatedAt}
            revisions={revisions}
            linkTarget="_blank"
            linkRel="noreferrer"
          />
        </aside>
      </div>
    </div>
  );
}
