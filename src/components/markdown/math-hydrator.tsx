"use client";

import { useEffect } from "react";
import { MATHJAX_READY_EVENT } from "@/components/markdown/mathjax-runtime";
import { GENERAL_SETTINGS_STORAGE_KEY } from "@/lib/general-settings";

export function MathHydrator() {
  useEffect(() => {
    const announceReady = () => {
      window.dispatchEvent(new CustomEvent(MATHJAX_READY_EVENT));
    };

    const existingConfig = document.getElementById("mathjax-config");
    if (!existingConfig) {
      const config = document.createElement("script");
      config.id = "mathjax-config";
      config.type = "text/javascript";
      config.text = `
        (() => {
          let storedSettings = {};
          try {
            storedSettings = JSON.parse(window.localStorage.getItem('${GENERAL_SETTINGS_STORAGE_KEY}') || '{}');
          } catch {}

          const selectedFont = typeof storedSettings.mathFontFamily === 'string'
            ? storedSettings.mathFontFamily
            : 'mathjax-newcm';

          window.MathJax = {
            tex: {
              inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
              displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
              packages: {'[+]': ['ams', 'newcommand', 'base']}
            },
            output: {
              font: selectedFont,
              fontPath: 'https://cdn.jsdelivr.net/npm/@mathjax/%%FONT%%-font'
            },
            svg: { fontCache: 'global' }
          };
        })();
      `;
      document.head.appendChild(config);
    }

    const existingScript = document.getElementById("mathjax-script") as HTMLScriptElement | null;
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "mathjax-script";
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js";
      script.async = true;
      script.addEventListener("load", announceReady, { once: true });
      document.head.appendChild(script);
    } else if (window.MathJax?.typesetPromise) {
      announceReady();
    } else {
      // Script exists but typesetPromise not yet available — it may have already
      // fired its load event while MathJax is still initializing. Poll until ready
      // rather than relying solely on a load listener that may never fire.
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
    }
  }, []);

  return null;
}
