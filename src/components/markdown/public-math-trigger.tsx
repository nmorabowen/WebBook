"use client";

import { useEffect, useEffectEvent, useRef, type CSSProperties } from "react";
import {
  hasUnrenderedMath,
  MATHJAX_READY_EVENT,
  queueMathJaxTypeset,
} from "@/components/markdown/mathjax-runtime";

type PublicMathTriggerProps = {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  "data-font-preset"?: string;
};

/**
 * Client wrapper that owns the math container ref and orchestrates MathJax
 * typesetting on public (server-rendered) pages. It replaces the outermost
 * prose div so no extra DOM node is added.
 */
export function PublicMathTrigger({
  children,
  className,
  style,
  "data-font-preset": dataFontPreset,
}: PublicMathTriggerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mathTypesetInFlightRef = useRef(false);
  const mathTypesetCancelRef = useRef<(() => void) | null>(null);

  const requestMathTypeset = useEffectEvent(() => {
    const node = containerRef.current;
    if (!node || typeof window === "undefined") {
      return;
    }

    if (!hasUnrenderedMath(node) || mathTypesetInFlightRef.current) {
      return;
    }

    let cancelled = false;
    mathTypesetInFlightRef.current = true;
    mathTypesetCancelRef.current = () => {
      cancelled = true;
    };

    void queueMathJaxTypeset(node, {
      shouldCancel: () => cancelled || containerRef.current !== node,
    }).finally(() => {
      if (containerRef.current === node) {
        mathTypesetInFlightRef.current = false;
        requestMathTypeset();
      }
      if (mathTypesetCancelRef.current) {
        mathTypesetCancelRef.current = null;
      }
    });
  });

  // Run after every render — catches content that arrives before MathJax is ready.
  useEffect(() => {
    requestMathTypeset();
  });

  // Re-trigger when MathJax signals it is ready (covers the delayed-load case).
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleMathJaxReady = () => {
      requestMathTypeset();
    };

    window.addEventListener(MATHJAX_READY_EVENT, handleMathJaxReady);
    return () => {
      window.removeEventListener(MATHJAX_READY_EVENT, handleMathJaxReady);
    };
  }, [requestMathTypeset]);

  // Cancel any in-flight typeset on unmount.
  useEffect(() => {
    return () => {
      mathTypesetCancelRef.current?.();
      mathTypesetCancelRef.current = null;
      mathTypesetInFlightRef.current = false;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      data-font-preset={dataFontPreset}
    >
      {children}
    </div>
  );
}
