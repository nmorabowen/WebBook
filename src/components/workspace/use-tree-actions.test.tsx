/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentTreeModel } from "@/components/workspace/use-content-tree-model";
import { useTreeActions } from "@/components/workspace/use-tree-actions";
import type { BookMeta, ContentTree, NoteMeta } from "@/lib/content/schemas";

function book(slug: string): BookMeta {
  return { slug, title: slug, status: "draft" } as unknown as BookMeta;
}
function note(slug: string): NoteMeta {
  return { slug, title: slug, status: "draft" } as unknown as NoteMeta;
}

const tree: ContentTree = {
  books: [{ meta: book("alpha"), route: "/b/alpha", chapters: [] }],
  notes: [{ meta: note("n1"), route: "/n/n1", location: { kind: "root" } }],
};

type Harness = { actions: ReturnType<typeof useTreeActions> };

function Probe({ onReady }: { onReady: (h: Harness) => void }) {
  const model = useContentTreeModel();
  const actions = useTreeActions(model);
  onReady({ actions });
  return null;
}

describe("useTreeActions", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  async function mount(extraResponses: Response[] = []) {
    const responses = [
      new Response(JSON.stringify({ tree, revision: "rev-1" }), { status: 200 }),
      ...extraResponses,
      new Response(JSON.stringify({ tree, revision: "rev-2" }), { status: 200 }),
    ];
    const fetchMock = vi.fn().mockImplementation(() => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch");
      return Promise.resolve(next);
    });
    vi.stubGlobal("fetch", fetchMock);

    let harness: Harness | null = null;
    await act(async () => {
      root.render(<Probe onReady={(h) => (harness = h)} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    return { harness: harness!, fetchMock };
  }

  it("delete book issues DELETE /api/books/:slug with revision", async () => {
    const { harness, fetchMock } = await mount([new Response("{}", { status: 200 })]);

    let outcome: Awaited<ReturnType<typeof harness.actions.remove>> | null = null;
    await act(async () => {
      outcome = await harness.actions.remove({ kind: "book", slug: "alpha" });
    });
    expect(outcome!.ok).toBe(true);
    const call = fetchMock.mock.calls[1];
    expect(call[0]).toBe("/api/books/alpha");
    expect((call[1] as RequestInit).method).toBe("DELETE");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ revision: "rev-1" });
  });

  it("delete chapter encodes nested path segments", async () => {
    const { harness, fetchMock } = await mount([new Response("{}", { status: 200 })]);
    await act(async () => {
      await harness.actions.remove({
        kind: "chapter",
        bookSlug: "alpha",
        chapterPath: ["intro", "deep"],
      });
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/books/alpha/chapters/intro/deep");
  });

  it("delete note hits /api/notes/:slug", async () => {
    const { harness, fetchMock } = await mount([new Response("{}", { status: 200 })]);
    await act(async () => {
      await harness.actions.remove({ kind: "note", slug: "n1" });
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notes/n1");
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe("DELETE");
  });

  it("demoteChapterToNote posts to /api/notes/from-chapter", async () => {
    const { harness, fetchMock } = await mount([new Response("{}", { status: 200 })]);
    await act(async () => {
      await harness.actions.demoteChapterToNote({
        kind: "chapter",
        bookSlug: "alpha",
        chapterPath: ["body"],
      });
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notes/from-chapter");
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      bookSlug: "alpha",
      chapterPath: ["body"],
      revision: "rev-1",
    });
  });

  it("promoteNoteToBook posts to /api/notes/:slug/move", async () => {
    const { harness, fetchMock } = await mount([new Response("{}", { status: 200 })]);
    await act(async () => {
      await harness.actions.promoteNoteToBook({ kind: "note", slug: "n1" }, "alpha");
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/notes/n1/move");
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      destinationBookSlug: "alpha",
      parentChapterPath: [],
      revision: "rev-1",
    });
  });

  it("surfaces non-OK responses as error without refreshing", async () => {
    const { harness, fetchMock } = await mount([
      new Response("stale", { status: 409 }),
    ]);
    let outcome: Awaited<ReturnType<typeof harness.actions.remove>> | null = null;
    await act(async () => {
      outcome = await harness.actions.remove({ kind: "note", slug: "n1" });
    });
    const o = outcome!;
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.error).toContain("stale");
    // Only: initial tree fetch + delete attempt. No refresh.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects demote for non-chapter ref", async () => {
    const { harness } = await mount();
    let outcome: Awaited<ReturnType<typeof harness.actions.demoteChapterToNote>> | null = null;
    await act(async () => {
      outcome = await harness.actions.demoteChapterToNote({ kind: "note", slug: "n1" });
    });
    const o = outcome!;
    expect(o.ok).toBe(false);
  });
});
