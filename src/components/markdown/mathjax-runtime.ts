"use client";

export type MathJaxRuntime = {
  startup?: {
    promise?: Promise<void>;
  };
  typesetClear?: (elements?: Element[]) => void;
  typesetPromise?: (elements?: Element[]) => Promise<void>;
};

declare global {
  interface Window {
    MathJax?: MathJaxRuntime;
  }
}

export const MATHJAX_READY_EVENT = "webbook:mathjax-ready";

// Module-scoped on purpose: MathJax's state (startup promise, font loader,
// etc.) is global, and concurrent typesetPromise calls on overlapping nodes
// can interleave and produce half-rendered output. Serializing here guarantees
// at most one typeset pass is in flight across the whole app. The chunked
// `delay` below keeps shouldCancel responsive so an unmounting component
// doesn't wedge the queue for everyone else.
let typesetQueue = Promise.resolve();
const DEFAULT_TYPESET_ATTEMPTS = 4;
const CANCEL_POLL_INTERVAL_MS = 30;
// Hard ceiling for how long we'll wait for window.MathJax to appear before
// giving up. Covers the CDN-unreachable / blocked-by-extension case so we
// don't poll forever. A visible `data-math-failed` attribute is then set
// on the container so CSS or the UI can surface a fallback.
const MATHJAX_RUNTIME_TIMEOUT_MS = 30_000;
export const MATHJAX_FAILED_ATTRIBUTE = "data-math-failed";

// Splits the wait into small chunks so shouldCancel() can interrupt an
// in-flight delay — unmounting a component should not leave a 120 ms retry
// blocking the module-wide typeset queue for every other container.
async function delay(durationMs: number, shouldCancel?: () => boolean) {
  let remaining = Math.max(0, durationMs);
  while (remaining > 0) {
    if (shouldCancel?.()) {
      return;
    }

    const slice = Math.min(CANCEL_POLL_INTERVAL_MS, remaining);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, slice);
    });
    remaining -= slice;
  }
}

async function waitForMathJaxRuntime(shouldCancel?: () => boolean) {
  if (typeof window === "undefined") {
    return null;
  }

  const deadline = Date.now() + MATHJAX_RUNTIME_TIMEOUT_MS;

  for (;;) {
    if (shouldCancel?.()) {
      return null;
    }

    const mathJax = window.MathJax;
    if (mathJax?.typesetPromise) {
      if (mathJax.startup?.promise) {
        await mathJax.startup.promise.catch(() => undefined);
      }
      return mathJax;
    }

    if (Date.now() >= deadline) {
      return null;
    }

    await delay(150, shouldCancel);
  }
}

export function hasUnrenderedMath(node: ParentNode) {
  const placeholders = node.querySelectorAll(".math-inline, .math-display");
  if (!placeholders.length) {
    return false;
  }

  return Array.from(placeholders).some((placeholder) => {
    if (placeholder.querySelector("mjx-container")) {
      return false;
    }

    const text = placeholder.textContent?.trim() ?? "";
    return text.startsWith("\\(") || text.startsWith("\\[");
  });
}

export function queueMathJaxTypeset(
  node: Element,
  options?: { shouldCancel?: () => boolean; maxAttempts?: number },
) {
  const shouldCancel = options?.shouldCancel;
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_TYPESET_ATTEMPTS);
  const markFailed = () => {
    if (!shouldCancel?.() && node.isConnected) {
      node.setAttribute(MATHJAX_FAILED_ATTRIBUTE, "true");
    }
  };

  const run = async () => {
    if (shouldCancel?.() || !node.isConnected) {
      return;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (shouldCancel?.() || !node.isConnected) {
        return;
      }

      const mathJax = await waitForMathJaxRuntime(shouldCancel);
      if (shouldCancel?.() || !node.isConnected) {
        return;
      }
      if (!mathJax) {
        // Runtime never appeared within the timeout — surface the failure
        // so CSS / UI can show a fallback instead of leaving \( and \) raw.
        markFailed();
        return;
      }

      mathJax.typesetClear?.([node]);
      await mathJax.typesetPromise?.([node]).catch(() => undefined);

      if (!hasUnrenderedMath(node)) {
        node.removeAttribute(MATHJAX_FAILED_ATTRIBUTE);
        return;
      }

      await delay(120 * (attempt + 1), shouldCancel);
    }

    // Exhausted retries without fully rendering — some placeholders remain.
    markFailed();
  };

  typesetQueue = typesetQueue.catch(() => undefined).then(run);
  return typesetQueue;
}

// Test-only: drop any pending queued typesets so tests start from a clean
// promise chain. Not for production use — real callers rely on serialization.
export function __resetMathJaxQueueForTests() {
  typesetQueue = Promise.resolve();
}
