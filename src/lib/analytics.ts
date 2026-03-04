const ANALYTICS_PREFIXES = ["/app", "/books", "/notes"];

export type AnalyticsProvider = "gtm" | "ga4" | null;

export function isGaMeasurementId(value?: string | null) {
  return Boolean(value?.trim() && /^G-[A-Za-z0-9]+$/.test(value.trim()));
}

export function isGtmContainerId(value?: string | null) {
  return Boolean(value?.trim() && /^GTM-[A-Z0-9]+$/.test(value.trim()));
}

export function getAnalyticsProvider(config: {
  measurementId?: string | null;
  gtmContainerId?: string | null;
}): AnalyticsProvider {
  if (isGtmContainerId(config.gtmContainerId)) {
    return "gtm";
  }

  if (isGaMeasurementId(config.measurementId)) {
    return "ga4";
  }

  return null;
}

export function isAnalyticsEnabled(config: {
  measurementId?: string | null;
  gtmContainerId?: string | null;
}) {
  return getAnalyticsProvider(config) !== null;
}

export function shouldTrackAnalyticsPath(pathname: string) {
  if (pathname === "/") {
    return true;
  }

  return ANALYTICS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function buildAnalyticsPagePath(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname;
}
