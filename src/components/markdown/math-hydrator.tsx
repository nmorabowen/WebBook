"use client";

import { useEffect } from "react";
import {
  MATHJAX_FAILED_ATTRIBUTE,
  MATHJAX_READY_EVENT,
} from "@/components/markdown/mathjax-runtime";
import { GENERAL_SETTINGS_STORAGE_KEY } from "@/lib/general-settings";

const MATHJAX_SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js";
const DEFAULT_MATH_FONT = "mathjax-newcm";

// MathJax reads config fields off window.MathJax during its own boot, then
// augments the same object with its runtime surface (typesetPromise, etc.).
// This shape describes the pre-boot half.
type MathJaxConfig = {
  tex: {
    inlineMath: string[][];
    displayMath: string[][];
    packages: Record<string, string[]>;
  };
  output: { font: string; fontPath: string };
  svg: { fontCache: string };
};

function readStoredMathFont(): string {
  try {
    const raw = window.localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_MATH_FONT;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "mathFontFamily" in parsed &&
      typeof (parsed as { mathFontFamily: unknown }).mathFontFamily === "string"
    ) {
      return (parsed as { mathFontFamily: string }).mathFontFamily;
    }
  } catch {
    // Ignore malformed JSON / storage errors — fall back to default.
  }

  return DEFAULT_MATH_FONT;
}

function buildMathJaxConfig(): MathJaxConfig {
  return {
    tex: {
      inlineMath: [["$", "$"], ["\\(", "\\)"]],
      displayMath: [["$$", "$$"], ["\\[", "\\]"]],
      packages: { "[+]": ["ams", "newcommand", "base"] },
    },
    output: {
      font: readStoredMathFont(),
      fontPath: "https://cdn.jsdelivr.net/npm/@mathjax/%%FONT%%-font",
    },
    svg: { fontCache: "global" },
  };
}

function markAllMathContainersFailed() {
  for (const node of document.querySelectorAll<HTMLElement>(
    `.math-inline, .math-display, [data-font-preset]`,
  )) {
    node.setAttribute(MATHJAX_FAILED_ATTRIBUTE, "true");
  }
}

export function MathHydrator() {
  useEffect(() => {
    const announceReady = () => {
      window.dispatchEvent(new CustomEvent(MATHJAX_READY_EVENT));
    };

    // Config must land on window.MathJax before the loader script executes.
    // We're in a client-only useEffect, so this happens synchronously before
    // the async script below starts running — by the time MathJax boots, the
    // config is already in place.
    if (!window.MathJax) {
      // @types/mathjax declares a stricter Window.MathJax shape; the loader
      // only reads config fields off whatever object is present, so cast
      // through unknown to avoid replicating the full namespace surface.
      (window as unknown as { MathJax: MathJaxConfig }).MathJax =
        buildMathJaxConfig();
    }

    const existingScript = document.getElementById(
      "mathjax-script",
    ) as HTMLScriptElement | null;

    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "mathjax-script";
      script.src = MATHJAX_SCRIPT_SRC;
      script.async = true;
      script.crossOrigin = "anonymous";
      // SRI is intentionally omitted: the src uses `@4` as a version range,
      // so the resolved file hash changes when jsdelivr promotes a new patch.
      // Pinning to an exact version (mathjax@4.x.y) is a prerequisite to
      // adding `integrity` without occasional load failures.
      script.addEventListener("load", announceReady, { once: true });
      script.addEventListener(
        "error",
        () => {
          // Loader failed (CDN blocked, offline, ad-blocker, etc.). Without
          // MathJax the runtime wait would time out anyway; surface the
          // failure immediately so UI can render a fallback.
          markAllMathContainersFailed();
        },
        { once: true },
      );
      document.head.appendChild(script);
      return;
    }

    if (window.MathJax?.typesetPromise) {
      announceReady();
      return;
    }

    // Script tag exists but MathJax hasn't finished booting. Its load event
    // may have already fired, so a listener alone isn't enough — poll until
    // typesetPromise appears, whichever happens first wins.
    const poll = window.setInterval(() => {
      if (window.MathJax?.typesetPromise) {
        window.clearInterval(poll);
        announceReady();
      }
    }, 50);
    existingScript.addEventListener(
      "load",
      () => {
        window.clearInterval(poll);
        announceReady();
      },
      { once: true },
    );
  }, []);

  return null;
}
