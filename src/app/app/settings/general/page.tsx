import { AppShell } from "@/components/app-shell";
import { GeneralSettingsPanel } from "@/components/editor/general-settings-panel";
import { GeneralSettingsSidebarControls } from "@/components/editor/general-settings-sidebar-controls";
import { requireAdminSession } from "@/lib/auth";
import { getContentTree, getGeneralSettings } from "@/lib/content/service";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const session = await requireAdminSession();
  const [tree, generalSettings] = await Promise.all([
    getContentTree(),
    getGeneralSettings(),
  ]);

  return (
    <AppShell
      tree={tree}
      currentPath="/app/settings/general"
      generalSettings={generalSettings}
      session={session}
      rightPanel={<GeneralSettingsSidebarControls />}
    >
      <div className="grid gap-6">
        <div className="grid gap-3">
          <span className="paper-badge">Workspace settings</span>
          <h1 className="font-serif text-5xl leading-none">General settings</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
            Control the shared authoring desk geometry so the dashboard and editor panels match the visual density you want.
          </p>
        </div>

        <GeneralSettingsPanel initialSettings={generalSettings} />
      </div>
    </AppShell>
  );
}
