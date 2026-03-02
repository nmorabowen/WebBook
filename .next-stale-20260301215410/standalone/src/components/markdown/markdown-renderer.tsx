"use client";

import rehypeSlug from "rehype-slug";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef } from "react";
import remarkGfm from "remark-gfm";
import { ExecutableCodeBlock } from "@/components/markdown/executable-code-block";
import type { ManifestEntry } from "@/lib/content/schemas";
import { createWikiLinkPlugin } from "@/lib/markdown/shared";
import { cn } from "@/lib/utils";

type MarkdownRendererProps = {
  markdown: string;
  manifest: ManifestEntry[];
  pageId: string;
  requester: "admin" | "public";
  allowExecution?: boolean;
  className?: string;
};

function parseCodeMeta(meta?: string | null) {
  const value = meta ?? "";
  const executable = /\bexec\b/.test(value);
  const id = value.match(/\bid=([A-Za-z0-9_-]+)/)?.[1];
  return { executable, id };
}

export function MarkdownRenderer({
  markdown,
  manifest,
  pageId,
  requester,
  allowExecution = false,
  className,
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const manifestMap = new Map<string, ManifestEntry>();
  for (const entry of manifest) {
    manifestMap.set(entry.slug, entry);
    if (entry.kind === "chapter" && entry.bookSlug) {
      manifestMap.set(`${entry.bookSlug}/${entry.slug}`, entry);
    }
  }

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof window === "undefined") {
      return;
    }

    window.MathJax?.typesetPromise?.([node]).catch(() => undefined);
  }, [markdown]);

  return (
    <div ref={containerRef} className={cn("book-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, createWikiLinkPlugin((target) => manifestMap.get(target) ?? null)]}
        rehypePlugins={[rehypeSlug]}
        components={{
          a: ({ className: linkClassName, ...props }) => (
            <a
              {...props}
              className={cn(
                "transition-colors hover:text-[var(--paper-ink)]",
                linkClassName,
              )}
            />
          ),
          code: ({ node, className: codeClassName, children, ...props }) => {
            const inline = !node || node.position?.start.line === node.position?.end.line;
            const language = codeClassName?.replace("language-", "") ?? "text";
            const meta =
              node && "meta" in node && typeof node.meta === "string" ? node.meta : undefined;
            const { executable, id } = parseCodeMeta(meta);
            const value = String(children).replace(/\n$/, "");

            if (inline) {
              return (
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              );
            }

            if (executable && language === "python") {
              return (
                <ExecutableCodeBlock
                  code={value}
                  language={language}
                  pageId={pageId}
                  cellId={id ?? `${pageId}-${language}`}
                  executionEnabled={allowExecution}
                  requester={requester}
                />
              );
            }

            return (
              <pre>
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
