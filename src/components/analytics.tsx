"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import {
  buildAnalyticsPagePath,
  getAnalyticsProvider,
  isAnalyticsEnabled,
  shouldTrackAnalyticsPath,
} from "@/lib/analytics";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type AnalyticsProps = {
  measurementId?: string;
  gtmContainerId?: string;
};

export function Analytics({ measurementId, gtmContainerId }: AnalyticsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const provider = getAnalyticsProvider({ measurementId, gtmContainerId });
  const enabled = isAnalyticsEnabled({ measurementId, gtmContainerId });
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    if (provider === "ga4" && measurementId) {
      window.gtag =
        window.gtag ||
        ((...args: unknown[]) => {
          window.dataLayer.push(args);
        });
      window.gtag("js", new Date());
      window.gtag("config", measurementId, { send_page_view: false });
    }
  }, [enabled, measurementId, provider]);

  useEffect(() => {
    if (!enabled || !pathname || !shouldTrackAnalyticsPath(pathname)) {
      return;
    }

    const pagePath = buildAnalyticsPagePath(pathname, search);
    if (lastTrackedPath.current === pagePath) {
      return;
    }

    lastTrackedPath.current = pagePath;
    window.dataLayer = window.dataLayer || [];
    if (provider === "ga4" && window.gtag) {
      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_location: window.location.href,
        page_title: document.title,
      });
      return;
    }

    if (provider === "gtm") {
      window.dataLayer.push({
        event: "page_view",
        page_path: pagePath,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [enabled, pathname, provider, search]);

  if (!enabled) {
    return null;
  }

  if (provider === "gtm" && gtmContainerId) {
    return (
      <>
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtmContainerId}');
          `}
        </Script>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmContainerId}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
      </>
    );
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
