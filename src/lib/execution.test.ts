import { describe, expect, it } from "vitest";
import { createRequestKey } from "./execution";

describe("createRequestKey", () => {
  it("is stable for identical inputs", () => {
    const first = createRequestKey({
      cellId: "cell",
      pageId: "note:demo",
      source: "print('hello')",
    });
    const second = createRequestKey({
      cellId: "cell",
      pageId: "note:demo",
      source: "print('hello')",
    });
    expect(first).toBe(second);
  });

  it("changes when the source changes", () => {
    const first = createRequestKey({
      cellId: "cell",
      pageId: "note:demo",
      source: "print('hello')",
    });
    const second = createRequestKey({
      cellId: "cell",
      pageId: "note:demo",
      source: "print('goodbye')",
    });
    expect(first).not.toBe(second);
  });
});
