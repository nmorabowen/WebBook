import { AuthoringSidebar } from "@/components/authoring-sidebar";
import type { ContentTree } from "@/lib/content/schemas";

type AppShellProps = {
  tree: ContentTree;
  currentPath?: string;
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
};

export function AppShell({ tree, currentPath, children, rightPanel }: AppShellProps) {
  return (
    <div className="paper-shell">
      <div className="paper-grid xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <aside className="paper-panel paper-panel-strong flex flex-col gap-6 p-6">
          <AuthoringSidebar tree={tree} currentPath={currentPath} />
        </aside>

        <main className="paper-panel paper-panel-strong p-5 md:p-7">{children}</main>

        <aside className="paper-panel hidden p-6 xl:block">{rightPanel}</aside>
      </div>
    </div>
  );
}
