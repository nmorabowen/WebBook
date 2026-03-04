import { describe, expect, it } from "vitest";
import {
  buildAnalyticsPagePath,
  isAnalyticsEnabled,
  shouldTrackAnalyticsPath,
} from "./analytics";

describe("analytics helpers", () => {
  it("enables analytics only when a measurement id is configured", () => {
    expect(isAnalyticsEnabled("G-ABCD1234")).toBe(true);
    expect(isAnalyticsEnabled("   ")).toBe(false);
    expect(isAnalyticsEnabled(undefined)).toBe(false);
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
