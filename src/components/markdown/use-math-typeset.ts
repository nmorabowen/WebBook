"use client";

import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
import {
  hasUnrenderedMath,
  MATHJAX_READY_EVENT,
  queueMathJaxTypeset,
} from "@/components/markdown/mathjax-runtime";

/**
 * Orchestrates MathJax typesetting for a container ref. Handles the
 * post-render, MathJax-ready, and unmount cases internally. Returns a
 * `requestMathTypeset` function that callers can invoke from additional
 * effects (e.g. layout-change observers) without re-implementing the
 * in-flight/cancel bookkeeping.
 */
const MATHJAX_TYPESET_TIMEOUT_MS = 5000;

export function useMathTypeset(containerRef: RefObject<HTMLElement | null>) {
  const inFlightRef = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);

  const requestMathTypeset = useEffectEvent(() => {
    const node = containerRef.current;
    if (!node || typeof window === "undefined") {
      return;
    }

    if (!hasUnrenderedMath(node) || inFlightRef.current) {
      return;
    }

    let cancelled = false;
    inFlightRef.current = true;

    const timeoutId = window.setTimeout(() => {
      cancelled = true;
    }, MATHJAX_TYPESET_TIMEOUT_MS);

    cancelRef.current = () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };

    void queueMathJaxTypeset(node, {
      shouldCancel: () => cancelled || containerRef.current !== node,
    }).finally(() => {
      window.clearTimeout(timeoutId);
      if (containerRef.current === node) {
        inFlightRef.current = false;
        // Re-check after completion in case content changed while in-flight.
        requestMathTypeset();
      }
      if (cancelRef.current) {
        cancelRef.current = null;
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
      cancelRef.current?.();
      cancelRef.current = null;
      inFlightRef.current = false;
    };
  }, []);

  return requestMathTypeset;
}
