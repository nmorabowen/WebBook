/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentTreeModel } from "@/components/workspace/use-content-tree-model";
import { useTreeDrop, type TreeDropOutcome } from "@/components/workspace/use-tree-drop";
import type { BookMeta, ContentTree, NoteMeta } from "@/lib/content/schemas";

function book(slug: string): BookMeta {
  return { slug, title: slug, status: "draft" } as unknown as BookMeta;
}
function note(slug: string): NoteMeta {
  return { slug, title: slug, status: "draft" } as unknown as NoteMeta;
}

const tree: ContentTree = {
  books: [{ meta: book("alpha"), route: "/b/alpha", chapters: [] }],
  notes: [
    { meta: note("n1"), route: "/n/n1", location: { kind: "root" } },
    { meta: note("n2"), route: "/n/n2", location: { kind: "root" } },
  ],
};

type Harness = {
  lastDropOutcome: TreeDropOutcome | null;
  drop: ReturnType<typeof useTreeDrop>;
  revision: string | null;
};

function Probe({ onReady }: { onReady: (h: Harness) => void }) {
  const model = useContentTreeModel();
  const drop = useTreeDrop(model);
  onReady({ lastDropOutcome: null, drop, revision: model.revision });
  return null;
}

describe("useTreeDrop", () => {
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

  it("issues the dispatcher-planned request and refreshes on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tree, revision: "rev-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tree, revision: "rev-2" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    let harness: Harness | null = null;
    await act(async () => {
      root.render(<Probe onReady={(h) => (harness = h)} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness!.revision).toBe("rev-1");

    let outcome: TreeDropOutcome | null = null;
    await act(async () => {
      outcome = await harness!.drop(
        { kind: "note", slug: "n1" },
        { kind: "note", slug: "n2" },
        "after",
      );
    });
    expect(outcome!.ok).toBe(true);
    // Call 1: initial tree fetch; Call 2: mutation; Call 3: refresh.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const mutationCall = fetchMock.mock.calls[1];
    expect(mutationCall[0]).toBe("/api/notes/reorder");
    const init = mutationCall[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      noteSlugs: ["n2", "n1"],
      revision: "rev-1",
    });
  });

  it("surfaces non-OK mutation responses as error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tree, revision: "rev-1" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("stale revision", { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    let harness: Harness | null = null;
    await act(async () => {
      root.render(<Probe onReady={(h) => (harness = h)} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: TreeDropOutcome | null = null;
    await act(async () => {
      outcome = await harness!.drop(
        { kind: "note", slug: "n1" },
        { kind: "note", slug: "n2" },
        "after",
      );
    });
    const o = outcome!;
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.error).toContain("stale");
  });

  it("rejects without fetching when dispatcher refuses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tree, revision: "rev-1" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    let harness: Harness | null = null;
    await act(async () => {
      root.render(<Probe onReady={(h) => (harness = h)} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    let outcome: TreeDropOutcome | null = null;
    await act(async () => {
      outcome = await harness!.drop(
        { kind: "book", slug: "alpha" },
        { kind: "book", slug: "alpha" },
        "after",
      );
    });
    expect(outcome!.ok).toBe(false);
    // Only the initial tree fetch should have fired.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
