import { Analytics } from "@/components/analytics";
import { getGeneralSettings } from "@/lib/content/service";

export async function AnalyticsRoot() {
  const settings = await getGeneralSettings();
  return (
    <Analytics
      measurementId={settings.analyticsMeasurementId}
      gtmContainerId={settings.analyticsGtmContainerId}
    />
  );
}
