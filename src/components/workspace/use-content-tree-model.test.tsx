/** @vitest-environment jsdom */

// React 19 requires this global flag to enable act() in test environments.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContentTreeModel } from "@/components/workspace/use-content-tree-model";
import type { ContentTree } from "@/lib/content/schemas";

function HookProbe({
  onModel,
}: {
  onModel: (model: ReturnType<typeof useContentTreeModel>) => void;
}) {
  const model = useContentTreeModel();
  onModel(model);
  return null;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

const emptyTree: ContentTree = { books: [], notes: [] };

describe("useContentTreeModel", () => {
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

  it("fetches tree + revision on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ tree: emptyTree, revision: "rev-123" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    let captured: ReturnType<typeof useContentTreeModel> | null = null;
    await act(async () => {
      root.render(<HookProbe onModel={(m) => (captured = m)} />);
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/content/tree",
      expect.objectContaining({ headers: expect.anything() }),
    );
    expect(captured!.revision).toBe("rev-123");
    expect(captured!.tree).toEqual(emptyTree);
    expect(captured!.loading).toBe(false);
    expect(captured!.error).toBeNull();
  });

  it("surfaces non-OK responses as errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );

    let captured: ReturnType<typeof useContentTreeModel> | null = null;
    await act(async () => {
      root.render(<HookProbe onModel={(m) => (captured = m)} />);
    });
    await flush();

    expect(captured!.error).toMatch(/500/);
    expect(captured!.tree).toBeNull();
    expect(captured!.revision).toBeNull();
    expect(captured!.loading).toBe(false);
  });

  it("refresh() re-fetches and updates revision", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tree: emptyTree, revision: "rev-1" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ tree: emptyTree, revision: "rev-2" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    let captured: ReturnType<typeof useContentTreeModel> | null = null;
    await act(async () => {
      root.render(<HookProbe onModel={(m) => (captured = m)} />);
    });
    await flush();
    expect(captured!.revision).toBe("rev-1");

    await act(async () => {
      await captured!.refresh();
    });
    expect(captured!.revision).toBe("rev-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
