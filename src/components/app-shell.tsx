"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import { AuthoringSidebar } from "@/components/authoring-sidebar";
import { WorkspaceStyleFrame } from "@/components/workspace-style-frame";
import type { SessionPayload } from "@/lib/auth";
import type { ContentTree, GeneralSettings } from "@/lib/content/schemas";
import { cn } from "@/lib/utils";

const RIGHT_PANEL_STORAGE_KEY = "webbook.app-shell.right-panel-collapsed";
const LEFT_PANEL_STORAGE_KEY = "webbook.app-shell.left-panel-collapsed";

type AppShellProps = {
  tree: ContentTree;
  currentPath?: string;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  rightPanelClassName?: string;
  generalSettings?: GeneralSettings;
  session?: SessionPayload | null;
};

export function AppShell({
  tree,
  currentPath,
  children,
  rightPanel,
  rightPanelClassName,
  generalSettings,
  session,
}: AppShellProps) {
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(RIGHT_PANEL_STORAGE_KEY) === "true";
  });
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const stored = window.localStorage.getItem(LEFT_PANEL_STORAGE_KEY);
    if (stored !== null) {
      return stored === "true";
    }

    return window.innerWidth < 900;
  });

  const toggleRightPanel = () => {
    setIsRightPanelCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(next));
      return next;
    });
  };
  const toggleLeftPanel = () => {
    setIsLeftPanelCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <WorkspaceStyleFrame generalSettings={generalSettings}>
      <div className="paper-shell">
        <div
          className={cn(
            "paper-grid app-shell-layout",
            isRightPanelCollapsed && "app-shell-layout-inspector-collapsed",
          )}
          style={{ gap: "var(--workspace-tile-spacing)" }}
        >
          <aside
            className={cn(
              "paper-panel paper-panel-strong app-shell-sidebar flex flex-col gap-6 p-6",
              isLeftPanelCollapsed && "is-collapsed",
            )}
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            <AuthoringSidebar
              tree={tree}
              currentPath={currentPath}
              generalSettings={generalSettings}
              session={session}
            />
          </aside>

          <main
            className="paper-panel paper-panel-strong p-5 md:p-7"
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            <button
              type="button"
              className="app-shell-panel-toggle app-shell-mobile-toggle mb-5"
              onClick={toggleLeftPanel}
              aria-expanded={!isLeftPanelCollapsed}
              aria-label={isLeftPanelCollapsed ? "Show authoring sidebar" : "Hide authoring sidebar"}
            >
              <PanelLeft className="h-4 w-4" />
            </button>
            {rightPanel ? (
              <div className="mb-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="app-shell-panel-toggle"
                  onClick={toggleRightPanel}
                  aria-expanded={!isRightPanelCollapsed}
                  aria-label={isRightPanelCollapsed ? "Show inspector panel" : "Hide inspector panel"}
                >
                  <ChevronLeft
                    className={cn("h-4 w-4 transition-transform", !isRightPanelCollapsed && "rotate-180")}
                  />
                </button>
              </div>
            ) : null}
            {children}
          </main>

          <aside
            className={cn(
              "paper-panel app-shell-inspector hidden p-6 xl:block",
              isRightPanelCollapsed && "is-collapsed",
            )}
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            {rightPanel ? (
              <div className={cn("app-shell-inspector-stack grid gap-5", rightPanelClassName)}>
                <div key="inspector-close" className="flex justify-end">
                  <button
                    type="button"
                    className="app-shell-panel-toggle"
                    onClick={toggleRightPanel}
                    aria-expanded={!isRightPanelCollapsed}
                    aria-label="Hide inspector panel"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div key="inspector-content" className="contents">
                  {rightPanel}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
        <button
          type="button"
          className={cn("app-shell-backdrop", isLeftPanelCollapsed && "is-hidden")}
          aria-label="Close authoring sidebar"
          onClick={toggleLeftPanel}
        />
      </div>
    </WorkspaceStyleFrame>
  );
}
