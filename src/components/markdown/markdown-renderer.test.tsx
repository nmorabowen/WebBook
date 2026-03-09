/** @vitest-environment jsdom */

import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

describe("MarkdownRenderer source navigation", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports visible lines and restores to the nearest rendered source block", async () => {
    const postMessageSpy = vi
      .spyOn(window, "postMessage")
      .mockImplementation(() => undefined);

    vi.stubGlobal(
      "requestAnimationFrame",
      ((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }) as typeof requestAnimationFrame,
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn() as typeof cancelAnimationFrame,
    );

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MarkdownRenderer
          markdown={`# One\n\nAlpha\n\n## Two`}
          manifest={[]}
          pageId="page-1"
          requester="admin"
          sourceNavigation
          currentRoute="/notes/page-1"
        />,
      );
    });

    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>("[data-source-line]"),
    ).filter((element) => {
      const line = Number(element.dataset.sourceLine);
      return line === 1 || line === 3 || line === 5;
    });

    const topCandidate = candidates.find((element) => element.dataset.sourceLine === "1");
    const middleCandidate = candidates.find((element) => element.dataset.sourceLine === "3");
    const lastCandidate = candidates.find((element) => element.dataset.sourceLine === "5");

    expect(topCandidate).toBeTruthy();
    expect(middleCandidate).toBeTruthy();
    expect(lastCandidate).toBeTruthy();

    topCandidate!.getBoundingClientRect = () =>
      ({ top: 0, bottom: 80 } as DOMRect);
    middleCandidate!.getBoundingClientRect = () =>
      ({ top: 220, bottom: 320 } as DOMRect);
    lastCandidate!.getBoundingClientRect = () =>
      ({ top: 520, bottom: 620 } as DOMRect);
    lastCandidate!.scrollIntoView = vi.fn() as typeof lastCandidate.scrollIntoView;

    postMessageSpy.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "webbook-preview-visible-line", line: 3 },
      window.location.origin,
    );

    postMessageSpy.mockClear();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: window.location.origin,
          data: {
            type: "webbook-editor-preview-line",
            line: 4,
          },
        }),
      );
    });

    expect(lastCandidate!.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "webbook-preview-visible-line", line: 5 },
      window.location.origin,
    );
  });
});
