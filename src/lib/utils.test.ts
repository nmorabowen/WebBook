import { describe, expect, it } from "vitest";
import {
  normalizeImageSizingMarkdown,
  parseImageSizingFromUrl,
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
