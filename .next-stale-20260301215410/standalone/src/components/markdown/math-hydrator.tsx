"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: Element[]) => Promise<void>;
    };
  }
}

export function MathHydrator() {
  useEffect(() => {
    const existingConfig = document.getElementById("mathjax-config");
    if (!existingConfig) {
      const config = document.createElement("script");
      config.id = "mathjax-config";
      config.type = "text/javascript";
      config.text = `
        window.MathJax = {
          tex: { inlineMath: [['$', '$'], ['\\\\(', '\\\\)']], displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']] },
          svg: { fontCache: 'global' }
        };
      `;
      document.head.appendChild(config);
    }

    if (!document.getElementById("mathjax-script")) {
      const script = document.createElement("script");
      script.id = "mathjax-script";
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  return null;
}
