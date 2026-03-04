import { describe, expect, it } from "vitest";
import {
  buildAnalyticsPagePath,
  getAnalyticsProvider,
  isGaMeasurementId,
  isAnalyticsEnabled,
  isGtmContainerId,
  shouldTrackAnalyticsPath,
} from "./analytics";

describe("analytics helpers", () => {
  it("validates supported analytics ids", () => {
    expect(isGaMeasurementId("G-ABCD1234")).toBe(true);
    expect(isGaMeasurementId("GTM-MRNSLL2K")).toBe(false);
    expect(isGtmContainerId("GTM-MRNSLL2K")).toBe(true);
    expect(isGtmContainerId("G-ABCD1234")).toBe(false);
  });

  it("enables analytics when ga4 or gtm is configured and prefers gtm", () => {
    expect(isAnalyticsEnabled({ measurementId: "G-ABCD1234" })).toBe(true);
    expect(isAnalyticsEnabled({ gtmContainerId: "GTM-MRNSLL2K" })).toBe(true);
    expect(isAnalyticsEnabled({ measurementId: "   " })).toBe(false);
    expect(isAnalyticsEnabled({})).toBe(false);
    expect(
      getAnalyticsProvider({
        measurementId: "G-ABCD1234",
        gtmContainerId: "GTM-MRNSLL2K",
      }),
    ).toBe("gtm");
    expect(getAnalyticsProvider({ measurementId: "G-ABCD1234" })).toBe("ga4");
  });

  it("tracks public reading routes and the authenticated workspace", () => {
    expect(shouldTrackAnalyticsPath("/")).toBe(true);
    expect(shouldTrackAnalyticsPath("/app")).toBe(true);
    expect(shouldTrackAnalyticsPath("/app/books/webbook-handbook")).toBe(true);
    expect(shouldTrackAnalyticsPath("/app/settings/general")).toBe(true);
    expect(shouldTrackAnalyticsPath("/books")).toBe(true);
    expect(shouldTrackAnalyticsPath("/books/webbook-handbook")).toBe(true);
    expect(shouldTrackAnalyticsPath("/notes/python-setup")).toBe(true);
    expect(shouldTrackAnalyticsPath("/login")).toBe(false);
  });

  it("preserves the query string in tracked page paths", () => {
    expect(buildAnalyticsPagePath("/books/webbook-handbook", "")).toBe(
      "/books/webbook-handbook",
    );
    expect(buildAnalyticsPagePath("/books/webbook-handbook", "chapter=1")).toBe(
      "/books/webbook-handbook?chapter=1",
    );
  });
});
