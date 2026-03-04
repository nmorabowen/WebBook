const ANALYTICS_PREFIXES = ["/app", "/books", "/notes"];

export function isAnalyticsEnabled(measurementId?: string | null) {
  return Boolean(measurementId?.trim());
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
