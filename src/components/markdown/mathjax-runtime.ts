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

let typesetQueue = Promise.resolve();

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
    return text.startsWith("\\(") || text.startsWith("\\[") || text.length > 0;
  });
}

export function queueMathJaxTypeset(
  node: Element,
  options?: { shouldCancel?: () => boolean },
) {
  const shouldCancel = options?.shouldCancel;
  const run = async () => {
    if (shouldCancel?.() || !node.isConnected) {
      return;
    }

    const mathJax = await waitForMathJaxRuntime(shouldCancel);
    if (!mathJax || shouldCancel?.() || !node.isConnected) {
      return;
    }

    mathJax.typesetClear?.([node]);
    await mathJax.typesetPromise?.([node]).catch(() => undefined);
  };

  typesetQueue = typesetQueue.catch(() => undefined).then(run);
  return typesetQueue;
}
