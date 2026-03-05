import { describe, expect, it } from "vitest";
import { defaultUploadTargetPath } from "@/lib/media-paths";

describe("media paths", () => {
  it("derives chapter upload paths from nested chapter ids", () => {
    expect(defaultUploadTargetPath("chapter:fem/part-one/setup")).toBe(
      "books/fem/chapters/part-one/setup",
    );
    expect(defaultUploadTargetPath("chapter:fem")).toBe("books/fem/chapters");
    expect(defaultUploadTargetPath("chapter:")).toBe("books/chapters");
  });
});
