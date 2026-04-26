import { describe, expect, it } from "vitest";
import {
  normalizeImageSizingMarkdown,
  parseImageSizingFromUrl,
  parseSeafileShareUrl,
} from "./utils";

describe("image sizing helpers", () => {
  it("normalizes markdown image sizing attributes into renderer metadata", () => {
    expect(
      normalizeImageSizingMarkdown("![Diagram](/media/example.png){width=60% height=240px}"),
    ).toBe(
      "![Diagram](/media/example.png#wb:width=60%25;height=240px)",
    );
  });

  it("parses encoded image sizing metadata from the url", () => {
    expect(
      parseImageSizingFromUrl("/media/example.png#wb:width=60%25;height=240px"),
    ).toEqual({
      src: "/media/example.png",
      width: "60%",
      height: "240px",
    });
  });
});

describe("parseSeafileShareUrl", () => {
  it("recognises file share urls and derives the file name from the p query", () => {
    expect(
      parseSeafileShareUrl("https://seafile.example.com/d/abc123XYZ/?p=%2Freport.pdf"),
    ).toEqual({
      kind: "directory",
      host: "seafile.example.com",
      name: "report.pdf",
      url: "https://seafile.example.com/d/abc123XYZ/?p=%2Freport.pdf",
    });
  });

  it("recognises bare file shares without a path", () => {
    const result = parseSeafileShareUrl("https://seafile.example.com/f/abc123/");
    expect(result).not.toBeNull();
    expect(result?.kind).toBe("file");
    expect(result?.host).toBe("seafile.example.com");
    expect(result?.name).toBeNull();
  });

  it("rejects non-seafile urls", () => {
    expect(parseSeafileShareUrl("https://example.com/some/page")).toBeNull();
    expect(parseSeafileShareUrl("not a url")).toBeNull();
  });
});
