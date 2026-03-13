import { BarChart3, ExternalLink, Radar, Route, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AnalyticsSettingsPanel } from "@/components/editor/analytics-settings-panel";
import { requireAdminSession } from "@/lib/auth";
import { getContentTree, getGeneralSettings } from "@/lib/content/service";
import { getAnalyticsProvider, isAnalyticsEnabled } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const trackedAreas = [
  {
    label: "Public library",
    routes: ["/", "/books/*", "/notes/*"],
    description: "Public reading traffic, book navigation, and note views.",
  },
  {
    label: "Authoring workspace",
    routes: ["/app", "/app/*"],
    description: "Editor and admin movement inside the workspace and settings pages.",
  },
];

export default async function AnalyticsSettingsPage() {
  const session = await requireAdminSession();
  const [tree, generalSettings] = await Promise.all([
    getContentTree(),
    getGeneralSettings(),
  ]);
  const measurementId = generalSettings.analyticsMeasurementId;
  const gtmContainerId = generalSettings.analyticsGtmContainerId;
  const analyticsEnabled = isAnalyticsEnabled({
    measurementId,
    gtmContainerId,
  });
  const provider = getAnalyticsProvider({
    measurementId,
    gtmContainerId,
  });

  return (
    <AppShell
      tree={tree}
      currentPath="/app/settings/analytics"
      generalSettings={generalSettings}
      session={session}
      rightPanel={
        <div className="grid gap-6">
          <div className="grid gap-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <p className="paper-label">Reporting flow</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                WebBook can load either Google Tag Manager or direct GA4 pageview tracking from the client. Reports are reviewed in Google Analytics or Tag Manager, not stored inside this workspace.
              </p>
            </div>
          </div>

          <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
              <ShieldCheck className="h-4 w-4" />
              Access
            </div>
            <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
              Signed in as <span className="font-semibold text-[var(--paper-ink)]">{session.username}</span>.
              Only admins can open or change analytics settings.
            </p>
          </div>

          <a
            href="https://analytics.google.com/analytics/web/"
            target="_blank"
            rel="noreferrer"
            className="paper-button paper-button-secondary inline-flex items-center justify-center gap-2"
          >
            Open Google Analytics
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-3">
          <span className="paper-badge">Measurement</span>
          <h1 className="font-serif text-5xl leading-none">Analytics</h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--paper-muted)]">
            Review whether tracking is active, which parts of WebBook send pageviews, and how to validate reporting after deployment.
          </p>
        </div>

        <AnalyticsSettingsPanel
          initialMeasurementId={measurementId}
          initialGtmContainerId={gtmContainerId}
          canEdit={session.role === "admin"}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <section
            className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-6"
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="paper-label">Status</p>
                <h2 className="text-2xl font-semibold">
                  {analyticsEnabled ? "Analytics enabled" : "Analytics disabled"}
                </h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-[var(--paper-muted)]">
              {analyticsEnabled
                ? provider === "gtm"
                  ? "A Google Tag Manager container is configured and loads for tracked routes."
                  : "A GA4 measurement ID is configured and the client script loads for tracked routes."
                : "No GTM or GA4 identifier is configured, so WebBook does not send analytics events."}
            </p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.86)] px-4 py-3">
                <p className="paper-label mb-1">Active provider</p>
                <p className="text-sm font-semibold text-[var(--paper-ink)]">
                  {provider === "gtm"
                    ? "Google Tag Manager"
                    : provider === "ga4"
                      ? "Google Analytics 4"
                      : "Not configured"}
                </p>
              </div>
              <div className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.86)] px-4 py-3">
                <p className="paper-label mb-1">GTM container</p>
                <p className="font-mono text-sm text-[var(--paper-ink)]">
                  {gtmContainerId?.trim() || "Not configured"}
                </p>
              </div>
              <div className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.86)] px-4 py-3">
                <p className="paper-label mb-1">GA4 measurement ID</p>
                <p className="font-mono text-sm text-[var(--paper-ink)]">
                  {measurementId?.trim() || "Not configured"}
                </p>
              </div>
            </div>
          </section>

          <section
            className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-6"
            style={{ borderRadius: "var(--workspace-corner-radius)" }}
          >
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
                <Route className="h-5 w-5" />
              </div>
              <div>
                <p className="paper-label">Tracked areas</p>
                <h2 className="text-2xl font-semibold">{trackedAreas.length} route groups</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-3">
              {trackedAreas.map((area) => (
                <div
                  key={area.label}
                  className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.86)] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--paper-ink)]">{area.label}</p>
                    <span className="paper-badge">{area.routes.join(" ")}</span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
                    {area.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section
          className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-6"
          style={{ borderRadius: "var(--workspace-corner-radius)" }}
        >
          <div className="grid gap-3">
            <p className="paper-label">Validation</p>
            <h2 className="text-2xl font-semibold">How to verify tracking</h2>
            <p className="max-w-3xl text-sm leading-7 text-[var(--paper-muted)]">
              After deployment, open the Google Analytics realtime report in one browser tab and browse public pages or workspace screens in another. New pageviews should appear for tracked routes within seconds.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.86)] px-4 py-3">
              <p className="paper-label mb-1">1. Configure</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                Save a <span className="font-mono text-[var(--paper-ink)]">GTM-...</span> container ID or <span className="font-mono text-[var(--paper-ink)]">G-...</span> measurement ID in this page.
              </p>
            </div>
            <div className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.86)] px-4 py-3">
              <p className="paper-label mb-1">2. Deploy</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                No redeploy is required. Saved identifiers are loaded from workspace settings.
              </p>
            </div>
            <div className="rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.86)] px-4 py-3">
              <p className="paper-label mb-1">3. Confirm</p>
              <p className="text-sm leading-7 text-[var(--paper-muted)]">
                Check Google Analytics or Tag Manager preview while navigating WebBook.
              </p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
