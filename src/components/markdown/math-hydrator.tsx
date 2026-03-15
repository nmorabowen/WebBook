"use client";

import { useEffect } from "react";

export function MathHydrator() {
  useEffect(() => {
    const existingConfig = document.getElementById("mathjax-config");
    if (!existingConfig) {
      const config = document.createElement("script");
      config.id = "mathjax-config";
      config.type = "text/javascript";
      config.text = `
        (() => {
          let storedSettings = {};
          try {
            storedSettings = JSON.parse(window.localStorage.getItem('webbook.general-settings') || '{}');
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

    if (!document.getElementById("mathjax-script")) {
      const script = document.createElement("script");
      script.id = "mathjax-script";
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  return null;
}
