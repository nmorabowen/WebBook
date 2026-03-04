"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildAnalyticsPagePath,
  isAnalyticsEnabled,
  shouldTrackAnalyticsPath,
} from "@/lib/analytics";

type GtagFunction = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: GtagFunction;
  }
}

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const enabled = isAnalyticsEnabled(measurementId);
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !measurementId) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      ((...args: unknown[]) => {
        window.dataLayer.push(args);
      });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { send_page_view: false });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !pathname || !shouldTrackAnalyticsPath(pathname) || !window.gtag) {
      return;
    }

    const pagePath = buildAnalyticsPagePath(pathname, search);
    if (lastTrackedPath.current === pagePath) {
      return;
    }

    lastTrackedPath.current = pagePath;
    window.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [enabled, pathname, search]);

  if (!enabled || !measurementId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
    </>
  );
}
