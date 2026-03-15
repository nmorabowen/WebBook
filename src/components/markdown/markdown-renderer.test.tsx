/** @vitest-environment jsdom */

import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  observe() {}

  unobserve() {}

  disconnect() {}

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }

  static reset() {
    ResizeObserverMock.instances = [];
  }
}

function installResizeObserverMock() {
  ResizeObserverMock.reset();
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
}

function renderMathInto(elements?: Element[]) {
  for (const element of elements ?? []) {
    for (const placeholder of element.querySelectorAll(".math-inline, .math-display")) {
      if (placeholder.querySelector("mjx-container")) {
        continue;
      }

      const rendered = document.createElement("mjx-container");
      rendered.setAttribute("jax", "SVG");
      placeholder.appendChild(rendered);
    }
  }
}

function createMathJaxStub(options?: { deferred?: boolean }) {
  let activeCalls = 0;
  let maxActiveCalls = 0;
  const pendingResolvers: Array<() => void> = [];
  const typesetClear = vi.fn();
  const typesetPromise = vi.fn((elements?: Element[]) => {
    activeCalls += 1;
    maxActiveCalls = Math.max(maxActiveCalls, activeCalls);

    if (options?.deferred) {
      return new Promise<void>((resolve) => {
        pendingResolvers.push(() => {
          renderMathInto(elements);
          activeCalls -= 1;
          resolve();
        });
      });
    }

    renderMathInto(elements);
    activeCalls -= 1;
    return Promise.resolve();
  });

  window.MathJax = {
    startup: {
      promise: Promise.resolve(),
    },
    typesetClear,
    typesetPromise,
  };

  return {
    typesetClear,
    typesetPromise,
    getMaxActiveCalls: () => maxActiveCalls,
    resolveNext: async () => {
      const resolve = pendingResolvers.shift();
      resolve?.();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

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
    ResizeObserverMock.reset();
    delete window.MathJax;
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

  it("supports local callback-based source navigation in a scroll container", async () => {
    const onRequestSourceLine = vi.fn();
    const onVisibleSourceLineChange = vi.fn();
    const onSourceNavigationHandled = vi.fn();

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

    function TestHarness({
      request,
    }: {
      request: { line: number; nonce: number } | null;
    }) {
      const viewportRef = useRef<HTMLDivElement>(null);

      return (
        <div ref={viewportRef} style={{ height: "400px", overflow: "auto" }}>
          <MarkdownRenderer
            markdown={`# One\n\nAlpha\n\n## Two`}
            manifest={[]}
            pageId="page-2"
            requester="admin"
            sourceNavigation
            currentRoute="/notes/page-2"
            sourceNavigationViewportRef={viewportRef}
            sourceNavigationRequest={request}
            onRequestSourceLine={onRequestSourceLine}
            onVisibleSourceLineChange={onVisibleSourceLineChange}
            onSourceNavigationHandled={onSourceNavigationHandled}
          />
        </div>
      );
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<TestHarness request={null} />);
    });

    const viewport = container.firstElementChild as HTMLDivElement | null;
    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>("[data-source-line]"),
    ).filter((element) => {
      const line = Number(element.dataset.sourceLine);
      return line === 1 || line === 3 || line === 5;
    });

    const topCandidate = candidates.find((element) => element.dataset.sourceLine === "1");
    const middleCandidate = candidates.find((element) => element.dataset.sourceLine === "3");
    const lastCandidate = candidates.find((element) => element.dataset.sourceLine === "5");
    const sourceNavDot = container.querySelector<HTMLButtonElement>(".source-nav-dot");

    expect(viewport).toBeTruthy();
    expect(topCandidate).toBeTruthy();
    expect(middleCandidate).toBeTruthy();
    expect(lastCandidate).toBeTruthy();
    expect(sourceNavDot).toBeTruthy();

    viewport!.getBoundingClientRect = () =>
      ({ top: 100, bottom: 500 } as DOMRect);
    topCandidate!.getBoundingClientRect = () =>
      ({ top: 120, bottom: 180 } as DOMRect);
    middleCandidate!.getBoundingClientRect = () =>
      ({ top: 260, bottom: 340 } as DOMRect);
    lastCandidate!.getBoundingClientRect = () =>
      ({ top: 620, bottom: 700 } as DOMRect);
    lastCandidate!.scrollIntoView = vi.fn() as typeof lastCandidate.scrollIntoView;

    onVisibleSourceLineChange.mockClear();

    await act(async () => {
      root?.render(<TestHarness request={{ line: 5, nonce: 1 }} />);
    });

    expect(lastCandidate!.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });
    expect(onSourceNavigationHandled).toHaveBeenCalledWith(
      { line: 5, nonce: 1 },
      5,
    );

    await act(async () => {
      viewport?.dispatchEvent(new Event("scroll"));
    });

    expect(onVisibleSourceLineChange).toHaveBeenCalledWith(3);

    await act(async () => {
      sourceNavDot?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(onRequestSourceLine).toHaveBeenCalled();
  });
});

describe("MarkdownRenderer math rendering", () => {
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
    ResizeObserverMock.reset();
    delete window.MathJax;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests initial MathJax typesetting for rendered math nodes", async () => {
    installResizeObserverMock();
    const mathJax = createMathJaxStub();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MarkdownRenderer
          markdown={"Inline $x^2$ and\n\n$$y=x$$"}
          manifest={[]}
          pageId="math-1"
          requester="admin"
        />,
      );
    });
    await flushEffects();

    expect(mathJax.typesetClear).toHaveBeenCalledTimes(1);
    expect(mathJax.typesetPromise).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("mjx-container")).not.toHaveLength(0);
  });

  it("re-typesets unchanged markdown when a later rerender loses rendered equations", async () => {
    installResizeObserverMock();
    const mathJax = createMathJaxStub();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MarkdownRenderer
          markdown={"Inline $x^2$ and\n\n$$y=x$$"}
          manifest={[]}
          pageId="math-2"
          requester="admin"
          className="render-pass-a"
        />,
      );
    });
    await flushEffects();

    container.querySelectorAll("mjx-container").forEach((element) => element.remove());

    await act(async () => {
      root?.render(
        <MarkdownRenderer
          markdown={"Inline $x^2$ and\n\n$$y=x$$"}
          manifest={[]}
          pageId="math-2"
          requester="admin"
          className="render-pass-b"
        />,
      );
    });
    await flushEffects();

    expect(mathJax.typesetPromise).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("mjx-container")).not.toHaveLength(0);
  });

  it("re-typesets missing equations after a layout-driven resize callback", async () => {
    installResizeObserverMock();
    const mathJax = createMathJaxStub();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MarkdownRenderer
          markdown={"Inline $x^2$ and\n\n$$y=x$$"}
          manifest={[]}
          pageId="math-3"
          requester="admin"
        />,
      );
    });
    await flushEffects();

    container.querySelectorAll("mjx-container").forEach((element) => element.remove());
    await act(async () => {
      ResizeObserverMock.instances[0]?.trigger();
    });
    await flushEffects();

    expect(mathJax.typesetPromise).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("mjx-container")).not.toHaveLength(0);
  });

  it("does not overlap MathJax work during repeated rerenders", async () => {
    installResizeObserverMock();
    const mathJax = createMathJaxStub({ deferred: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MarkdownRenderer
          markdown={"Inline $x^2$ and\n\n$$y=x$$"}
          manifest={[]}
          pageId="math-4"
          requester="admin"
          className="render-pass-a"
        />,
      );
    });
    await flushEffects();

    await act(async () => {
      root?.render(
        <MarkdownRenderer
          markdown={"Inline $x^2$ and\n\n$$y=x$$"}
          manifest={[]}
          pageId="math-4"
          requester="admin"
          className="render-pass-b"
        />,
      );
      root?.render(
        <MarkdownRenderer
          markdown={"Inline $x^2$ and\n\n$$y=x$$"}
          manifest={[]}
          pageId="math-4"
          requester="admin"
          className="render-pass-c"
        />,
      );
    });
    await flushEffects();

    expect(mathJax.typesetPromise).toHaveBeenCalledTimes(1);
    expect(mathJax.getMaxActiveCalls()).toBe(1);

    await mathJax.resolveNext();
    await flushEffects();

    expect(container.querySelectorAll("mjx-container")).not.toHaveLength(0);
    expect(mathJax.getMaxActiveCalls()).toBe(1);
  });
});
