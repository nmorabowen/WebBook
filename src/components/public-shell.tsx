"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, BookOpenText, GripVertical, Search } from "lucide-react";
import { WorkspaceStyleFrame } from "@/components/workspace-style-frame";
import type { ContentTree, GeneralSettings } from "@/lib/content/schemas";
import type { FontPreset } from "@/lib/font-presets";
import {
  DEFAULT_GENERAL_SETTINGS,
  GENERAL_SETTINGS_LIMITS,
} from "@/lib/general-settings-config";
import { normalizeGeneralSettings } from "@/lib/general-settings";
import { cn } from "@/lib/utils";

type PublicShellProps = {
  tree: ContentTree;
  currentPath?: string;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  bookSlug?: string;
  fontPreset?: FontPreset;
  generalSettings?: GeneralSettings;
  readingWidth?: number;
};

function clampPanelWidth(width: number) {
  if (width <= 164) {
    return 0;
  }

  return Math.max(
    GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.min,
    Math.min(GENERAL_SETTINGS_LIMITS.publicLeftPanelWidth.max, Math.round(width)),
  );
}

export function PublicShell({
  tree,
  currentPath,
  children,
  rightPanel,
  bookSlug,
  fontPreset = "source-serif",
  generalSettings,
  readingWidth,
}: PublicShellProps) {
  const normalizedSettings = normalizeGeneralSettings(
    generalSettings ?? DEFAULT_GENERAL_SETTINGS,
  );
  const activeBook = tree.books.find((item) => item.meta.slug === bookSlug);
  const [leftWidthOverride, setLeftWidthOverride] = useState<number | null>(null);
  const [rightWidthOverride, setRightWidthOverride] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<"left" | "right" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasRightPanel = Boolean(rightPanel);
  const leftWidth = leftWidthOverride ?? normalizedSettings.publicLeftPanelWidth;
  const rightWidth = rightWidthOverride ?? normalizedSettings.publicRightPanelWidth;
  const isLeftCollapsed = leftWidth === 0;
  const isRightCollapsed = !hasRightPanel || rightWidth === 0;

  useEffect(() => {
    if (!dragTarget) {
      return;
    }

    const updateWidths = (clientX: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const bounds = container.getBoundingClientRect();
      if (dragTarget === "left") {
        setLeftWidthOverride(clampPanelWidth(clientX - bounds.left));
        return;
      }

      setRightWidthOverride(clampPanelWidth(bounds.right - clientX));
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateWidths(event.clientX);
    };

    const stopDragging = () => {
      setDragTarget(null);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [dragTarget]);

  const layoutStyle = useMemo(
    () =>
      ({
        "--public-left-panel-width": isLeftCollapsed ? "0px" : `${leftWidth}px`,
        "--public-right-panel-width": isRightCollapsed ? "0px" : `${rightWidth}px`,
        "--public-reading-width": `${readingWidth ?? 46}ch`,
      }) as CSSProperties,
    [isLeftCollapsed, isRightCollapsed, leftWidth, readingWidth, rightWidth],
  );

  return (
    <WorkspaceStyleFrame generalSettings={generalSettings}>
      <div className="paper-shell" data-font-preset={fontPreset}>
        <div
          ref={containerRef}
          className={cn("paper-grid public-shell-layout", dragTarget && "public-shell-layout-dragging")}
          style={{
            ...layoutStyle,
            gap: "var(--workspace-tile-spacing)",
          }}
        >
          <aside
            className={cn(
              "paper-panel paper-panel-strong public-shell-panel flex flex-col gap-5 p-6",
              isLeftCollapsed && "is-collapsed",
            )}
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            <div className="grid gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--paper-muted)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to library
              </Link>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[var(--paper-accent-soft)] p-3 text-[var(--paper-accent)]">
                  <BookOpenText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--paper-muted)]">
                    WebBook
                  </p>
                  <h1 className="font-serif text-3xl">Reading room</h1>
                </div>
              </div>
            </div>

            {activeBook ? (
              <div className="grid gap-2">
                <Link
                  href={`/books/${activeBook.meta.slug}`}
                  className={cn(
                    "paper-nav-link",
                    currentPath === `/books/${activeBook.meta.slug}` &&
                      "paper-nav-link-active",
                  )}
                >
                  {activeBook.meta.title}
                </Link>
                {activeBook.chapters.map((chapter) => (
                  <Link
                    key={`${activeBook.meta.slug}/${chapter.meta.slug}`}
                    href={`/books/${activeBook.meta.slug}/${chapter.meta.slug}`}
                    className={cn(
                      "paper-nav-link ml-4",
                      currentPath ===
                        `/books/${activeBook.meta.slug}/${chapter.meta.slug}` &&
                        "paper-nav-link-active",
                    )}
                  >
                    <span>{chapter.meta.title}</span>
                    <span className="text-xs">{chapter.meta.order}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="grid gap-2">
                {tree.books.map((book) => (
                  <Link key={book.meta.slug} href={`/books/${book.meta.slug}`} className="paper-nav-link">
                    {book.meta.title}
                  </Link>
                ))}
                {tree.notes.map((note) => (
                  <Link key={note.meta.slug} href={`/notes/${note.meta.slug}`} className="paper-nav-link">
                    {note.meta.title}
                  </Link>
                ))}
              </div>
            )}

            <div
              className="mt-auto border border-[var(--paper-border)] bg-[rgba(255,255,255,0.55)] p-4"
              style={{ borderRadius: "var(--workspace-radius-lg)" }}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Search className="h-4 w-4 text-[var(--paper-accent)]" />
                Linked thinking
              </div>
              <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                WebBook resolves wiki links, builds backlinks, and keeps notes publishable as their own HTML pages.
              </p>
            </div>
          </aside>

          <button
            type="button"
            className="public-shell-handle public-shell-handle-left"
            aria-label="Resize left reading panel"
            onPointerDown={(event) => {
              event.preventDefault();
              setDragTarget("left");
            }}
          >
            <span className="public-shell-grip">
              <GripVertical className="h-4 w-4" />
            </span>
          </button>

          <main
            className="paper-panel paper-panel-strong public-shell-main animate-rise p-6 md:p-10"
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            {children}
          </main>

          <button
            type="button"
            className={cn(
              "public-shell-handle public-shell-handle-right",
              !hasRightPanel && "is-collapsed",
            )}
            aria-label="Resize right reading panel"
            onPointerDown={(event) => {
              event.preventDefault();
              if (!hasRightPanel) {
                return;
              }
              setDragTarget("right");
            }}
          >
            <span className="public-shell-grip">
              <GripVertical className="h-4 w-4" />
            </span>
          </button>

          <aside
            className={cn(
              "paper-panel public-shell-panel hidden p-6 xl:block",
              (isRightCollapsed || !hasRightPanel) && "is-collapsed",
            )}
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            {rightPanel}
          </aside>
        </div>
      </div>
    </WorkspaceStyleFrame>
  );
}
