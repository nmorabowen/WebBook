import { LockKeyhole, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AccessSettingsPanel } from "@/components/editor/access-settings-panel";
import { requireSession } from "@/lib/auth";
import { getContentTree, getGeneralSettings } from "@/lib/content/service";
import { getUserByUsername, listUsers } from "@/lib/user-store";

export const dynamic = "force-dynamic";

export default async function AccessSettingsPage() {
  const session = await requireSession();
  const [tree, generalSettings, listedUsers, currentUser] = await Promise.all([
    getContentTree(),
    getGeneralSettings(),
    session.role === "admin" ? listUsers() : Promise.resolve([]),
    getUserByUsername(session.username),
  ]);
  const users = session.role === "admin" ? listedUsers : currentUser ? [currentUser] : [];

  return (
    <AppShell
      tree={tree}
      currentPath="/app/settings/access"
      generalSettings={generalSettings}
      session={session}
      rightPanel={
        <div className="grid gap-6">
          <div className="grid gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="paper-label">Access controls</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                Manage workspace sign-in, user roles, and password resets from one place.
              </p>
            </div>
          </div>
          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <LockKeyhole className="h-4 w-4" />
              Scope
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Editors can write and publish. Only admins can create additional users and change global workspace settings.
            </p>
          </div>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-3">
          <span className="paper-badge">Security</span>
          <h1 className="font-serif text-5xl leading-none">Access settings</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
            Control who can enter the authoring desk and keep workspace passwords current.
          </p>
        </div>

        <AccessSettingsPanel session={session} initialUsers={users} />
      </div>
    </AppShell>
  );
}
