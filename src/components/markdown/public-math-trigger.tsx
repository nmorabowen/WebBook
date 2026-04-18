"use client";

import { useRef, type CSSProperties } from "react";
import { useMathTypeset } from "@/components/markdown/use-math-typeset";

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
  useMathTypeset(containerRef);

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
