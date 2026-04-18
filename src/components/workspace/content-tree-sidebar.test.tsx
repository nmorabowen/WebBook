/** @vitest-environment jsdom */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentTreeSidebar } from "@/components/workspace/content-tree-sidebar";
import type { BookMeta, ChapterMeta, ContentTree, NoteMeta } from "@/lib/content/schemas";

function bookMeta(slug: string, title: string): BookMeta {
  return {
    slug,
    title,
    status: "draft",
    order: 1,
    summary: "",
    tags: [],
    keywords: [],
  } as unknown as BookMeta;
}

function chapterMeta(slug: string, title: string): ChapterMeta {
  return {
    slug,
    title,
    status: "draft",
    order: 1,
    summary: "",
    tags: [],
    keywords: [],
  } as unknown as ChapterMeta;
}

function noteMeta(slug: string, title: string): NoteMeta {
  return {
    slug,
    title,
    status: "draft",
    order: 1,
    summary: "",
    tags: [],
    keywords: [],
  } as unknown as NoteMeta;
}

const tree: ContentTree = {
  books: [
    {
      meta: bookMeta("alpha", "Alpha Book"),
      route: "/books/alpha",
      chapters: [
        {
          meta: chapterMeta("intro", "Intro"),
          route: "/books/alpha/chapters/intro",
          path: ["intro"],
          children: [
            {
              meta: chapterMeta("deeper", "Deeper"),
              route: "/books/alpha/chapters/intro/deeper",
              path: ["intro", "deeper"],
              children: [],
            },
          ],
        },
      ],
    },
  ],
  notes: [
    {
      meta: noteMeta("scratchpad", "Scratchpad"),
      route: "/notes/scratchpad",
      location: { kind: "root" } as const,
    },
  ],
};

describe("ContentTreeSidebar", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ tree, revision: "rev-initial" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
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

  it("renders books and notes from initialTree", async () => {
    await act(async () => {
      root.render(<ContentTreeSidebar initialTree={tree} initialRevision="rev-1" />);
    });
    expect(container.textContent).toContain("Alpha Book");
    expect(container.textContent).toContain("Intro");
    expect(container.textContent).toContain("Scratchpad");
    // Book is expanded by default — top-level chapter visible.
    expect(container.querySelector('a[href="/app/books/alpha/chapters/intro"]')).not.toBeNull();
    // Child chapter collapsed by default.
    expect(
      container.querySelector('a[href="/app/books/alpha/chapters/intro/deeper"]'),
    ).toBeNull();
  });

  it("expands a chapter to reveal children and persists state", async () => {
    await act(async () => {
      root.render(<ContentTreeSidebar initialTree={tree} initialRevision="rev-1" />);
    });

    const chapterToggle = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="Expand"]'),
    ).find((btn) => btn.closest("div")?.textContent?.includes("Intro"));
    expect(chapterToggle).toBeDefined();

    await act(async () => {
      chapterToggle!.click();
    });

    expect(
      container.querySelector('a[href="/app/books/alpha/chapters/intro/deeper"]'),
    ).not.toBeNull();

    const stored = window.localStorage.getItem("webbook.content-tree-sidebar.expand");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toMatchObject({ "chapter:alpha/intro": true });
  });

  it("collapses a book when its toggle is clicked", async () => {
    await act(async () => {
      root.render(<ContentTreeSidebar initialTree={tree} initialRevision="rev-1" />);
    });

    expect(
      container.querySelector('a[href="/app/books/alpha/chapters/intro"]'),
    ).not.toBeNull();

    const bookToggle = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Collapse"]',
    );
    expect(bookToggle).not.toBeNull();

    await act(async () => {
      bookToggle!.click();
    });

    expect(
      container.querySelector('a[href="/app/books/alpha/chapters/intro"]'),
    ).toBeNull();
  });

  it("opens context menu via right-click and invokes delete action", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ tree, revision: "rev-2" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await act(async () => {
      root.render(<ContentTreeSidebar initialTree={tree} initialRevision="rev-1" />);
    });

    const scratchpadLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/app/notes/scratchpad"]',
    );
    expect(scratchpadLink).toBeTruthy();
    const noteRow = scratchpadLink!.closest("div.group") as HTMLDivElement | null;
    expect(noteRow).toBeTruthy();

    await act(async () => {
      noteRow!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });

    const deleteBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
    ).find((b) => b.textContent?.trim() === "Delete");
    expect(deleteBtn).toBeTruthy();

    await act(async () => {
      deleteBtn!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();
    const deleteCall = fetchMock.mock.calls.find(
      (c) => c[0] === "/api/notes/scratchpad",
    );
    expect(deleteCall).toBeTruthy();
    expect((deleteCall![1] as RequestInit).method).toBe("DELETE");
  });

  it("shows loading state when no initial data and fetch is pending", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    await act(async () => {
      root.render(<ContentTreeSidebar />);
    });

    expect(container.querySelector('[data-testid="content-tree-sidebar-loading"]')).not.toBeNull();

    await act(async () => {
      resolveFetch(
        new Response(JSON.stringify({ tree, revision: "rev-x" }), { status: 200 }),
      );
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="content-tree-sidebar"]')).not.toBeNull();
  });
});
