import { LayoutGrid, SlidersHorizontal } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { GeneralSettingsPanel } from "@/components/editor/general-settings-panel";
import { requireSession } from "@/lib/auth";
import { getContentTree, getGeneralSettings } from "@/lib/content/service";

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requireSession();
  const [tree, generalSettings] = await Promise.all([
    getContentTree(),
    getGeneralSettings(),
  ]);

  return (
    <AppShell
      tree={tree}
      currentPath="/app/settings/general"
      generalSettings={generalSettings}
      rightPanel={
        <div className="grid gap-6">
          <div className="grid gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <p className="paper-label">Workspace controls</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                These values affect the authoring dashboard shell, including tile spacing and panel curvature.
              </p>
            </div>
          </div>
          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <LayoutGrid className="h-4 w-4" />
              Live scope
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Changes apply to the authoring workspace after save and refresh the active dashboard layout immediately.
            </p>
          </div>
        </div>
      }
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
