import { Keyboard, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ShortcutsSettingsPanel } from "@/components/editor/shortcuts-settings-panel";
import { requireSession } from "@/lib/auth";
import { getContentTree, getGeneralSettings } from "@/lib/content/service";

export const dynamic = "force-dynamic";

export default async function ShortcutsSettingsPage() {
  const session = await requireSession();
  const [tree, generalSettings] = await Promise.all([
    getContentTree(),
    getGeneralSettings(),
  ]);

  return (
    <AppShell
      tree={tree}
      currentPath="/app/settings/shortcuts"
      generalSettings={generalSettings}
      session={session}
      rightPanel={
        <div className="grid gap-6">
          <div className="grid gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <p className="paper-label">Shortcut scope</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                These bindings are stored for your current account on this device, so different editors can keep their own preferred key map.
              </p>
            </div>
          </div>
          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <Sparkles className="h-4 w-4" />
              Capture tips
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Click <span className="font-semibold">Record</span>, then press the shortcut you want.
              Use <span className="font-semibold">Escape</span> to cancel capture.
            </p>
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-3">
          <span className="paper-badge">Editor controls</span>
          <h1 className="font-serif text-5xl leading-none">Shortcuts</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
            Customize the markdown editor key bindings so math, formatting, uploads,
            and history controls fit your own writing flow.
          </p>
        </div>

        <ShortcutsSettingsPanel scopeKey={session.username} />
      </div>
    </AppShell>
  );
}
