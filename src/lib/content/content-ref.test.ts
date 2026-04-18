import { describe, expect, it } from "vitest";
import {
  contentRefsEqual,
  decodeContentRef,
  encodeContentRef,
  type ContentRef,
} from "@/lib/content/content-ref";

describe("encodeContentRef", () => {
  it("encodes a book", () => {
    expect(encodeContentRef({ kind: "book", bookSlug: "fem" })).toEqual(["books", "fem"]);
  });

  it("encodes a top-level chapter", () => {
    expect(
      encodeContentRef({ kind: "chapter", bookSlug: "fem", chapterPath: ["intro"] }),
    ).toEqual(["books", "fem", "chapters", "intro"]);
  });

  it("encodes a deeply nested chapter", () => {
    expect(
      encodeContentRef({
        kind: "chapter",
        bookSlug: "fem",
        chapterPath: ["intro", "preface", "foreword"],
      }),
    ).toEqual([
      "books",
      "fem",
      "chapters",
      "intro",
      "chapters",
      "preface",
      "chapters",
      "foreword",
    ]);
  });

  it("encodes a root note", () => {
    expect(encodeContentRef({ kind: "note", slug: "python-setup" })).toEqual([
      "notes",
      "python-setup",
    ]);
  });

  it("throws on an empty chapter path", () => {
    expect(() =>
      encodeContentRef({ kind: "chapter", bookSlug: "fem", chapterPath: [] }),
    ).toThrow(/at least one/i);
  });
});

describe("decodeContentRef", () => {
  it("round-trips every kind", () => {
    const cases: ContentRef[] = [
      { kind: "book", bookSlug: "fem" },
      { kind: "chapter", bookSlug: "fem", chapterPath: ["intro"] },
      {
        kind: "chapter",
        bookSlug: "fem",
        chapterPath: ["intro", "preface"],
      },
      { kind: "note", slug: "python-setup" },
    ];
    for (const ref of cases) {
      expect(decodeContentRef(encodeContentRef(ref))).toEqual(ref);
    }
  });

  it("returns null for too-short paths", () => {
    expect(decodeContentRef([])).toBeNull();
    expect(decodeContentRef(["books"])).toBeNull();
    expect(decodeContentRef(["notes"])).toBeNull();
  });

  it("returns null for unknown roots", () => {
    expect(decodeContentRef(["pages", "foo"])).toBeNull();
  });

  it("returns null for malformed chapter paths", () => {
    // odd number of trailing segments
    expect(decodeContentRef(["books", "fem", "chapters"])).toBeNull();
    // missing 'chapters' literal between slugs
    expect(decodeContentRef(["books", "fem", "intro", "preface"])).toBeNull();
    // empty segments
    expect(decodeContentRef(["books", "fem", "chapters", ""])).toBeNull();
    expect(decodeContentRef(["notes", ""])).toBeNull();
  });

  it("returns null for a three-segment 'notes' path", () => {
    expect(decodeContentRef(["notes", "setup", "extra"])).toBeNull();
  });
});

describe("contentRefsEqual", () => {
  it("is true for identical refs", () => {
    expect(
      contentRefsEqual(
        { kind: "book", bookSlug: "fem" },
        { kind: "book", bookSlug: "fem" },
      ),
    ).toBe(true);
    expect(
      contentRefsEqual(
        { kind: "chapter", bookSlug: "fem", chapterPath: ["a", "b"] },
        { kind: "chapter", bookSlug: "fem", chapterPath: ["a", "b"] },
      ),
    ).toBe(true);
    expect(
      contentRefsEqual({ kind: "note", slug: "x" }, { kind: "note", slug: "x" }),
    ).toBe(true);
  });

  it("is false across kinds or differing content", () => {
    expect(
      contentRefsEqual(
        { kind: "book", bookSlug: "fem" },
        { kind: "book", bookSlug: "opensees" },
      ),
    ).toBe(false);
    expect(
      contentRefsEqual(
        { kind: "chapter", bookSlug: "fem", chapterPath: ["intro"] },
        { kind: "chapter", bookSlug: "fem", chapterPath: ["intro", "extra"] },
      ),
    ).toBe(false);
    expect(
      contentRefsEqual({ kind: "note", slug: "a" }, { kind: "book", bookSlug: "a" }),
    ).toBe(false);
  });
});
