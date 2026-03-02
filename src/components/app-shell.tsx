import { AuthoringSidebar } from "@/components/authoring-sidebar";
import { WorkspaceStyleFrame } from "@/components/workspace-style-frame";
import type { ContentTree, GeneralSettings } from "@/lib/content/schemas";

type AppShellProps = {
  tree: ContentTree;
  currentPath?: string;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  generalSettings?: GeneralSettings;
};

export function AppShell({
  tree,
  currentPath,
  children,
  rightPanel,
  generalSettings,
}: AppShellProps) {
  return (
    <WorkspaceStyleFrame generalSettings={generalSettings}>
      <div className="paper-shell">
        <div
          className="paper-grid xl:grid-cols-[280px_minmax(0,1fr)_300px]"
          style={{ gap: "var(--workspace-tile-spacing)" }}
        >
          <aside
            className="paper-panel paper-panel-strong flex flex-col gap-6 p-6"
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            <AuthoringSidebar
              tree={tree}
              currentPath={currentPath}
              generalSettings={generalSettings}
            />
          </aside>

          <main
            className="paper-panel paper-panel-strong p-5 md:p-7"
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            {children}
          </main>

          <aside
            className="paper-panel hidden p-6 xl:block"
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            {rightPanel}
          </aside>
        </div>
      </div>
    </WorkspaceStyleFrame>
  );
}
