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

let typesetQueue = Promise.resolve();
const DEFAULT_TYPESET_ATTEMPTS = 4;

function delay(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

async function waitForMathJaxRuntime(shouldCancel?: () => boolean) {
  if (typeof window === "undefined") {
    return null;
  }

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

    await delay(150);
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
  const run = async () => {
    if (shouldCancel?.() || !node.isConnected) {
      return;
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const mathJax = await waitForMathJaxRuntime(shouldCancel);
      if (!mathJax || shouldCancel?.() || !node.isConnected) {
        return;
      }

      mathJax.typesetClear?.([node]);
      await mathJax.typesetPromise?.([node]).catch(() => undefined);

      if (!hasUnrenderedMath(node)) {
        return;
      }

      await delay(120 * (attempt + 1));
    }
  };

  typesetQueue = typesetQueue.catch(() => undefined).then(run);
  return typesetQueue;
}
