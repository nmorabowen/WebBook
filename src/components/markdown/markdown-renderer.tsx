"use client";

import rehypeSlug from "rehype-slug";
import ReactMarkdown from "react-markdown";
import { Children, isValidElement, useEffect, useMemo, useRef } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ExecutableCodeBlock } from "@/components/markdown/executable-code-block";
import { bookTypographyStyle, type BookTypography } from "@/lib/book-typography";
import type { ManifestEntry } from "@/lib/content/schemas";
import type { FontPreset } from "@/lib/font-presets";
import { createWikiLinkPlugin } from "@/lib/markdown/shared";
import {
  cn,
  extractYouTubeVideoId,
  normalizeImageSizingMarkdown,
  normalizeYouTubeIframes,
  parseImageSizingFromUrl,
} from "@/lib/utils";

type MarkdownRendererProps = {
  markdown: string;
  manifest: ManifestEntry[];
  pageId: string;
  requester: "admin" | "public";
  allowExecution?: boolean;
  className?: string;
  fontPreset?: FontPreset;
  typography?: Partial<BookTypography>;
};
type Alignment = "left" | "center" | "right";
type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "aligned"; align: Alignment; content: string };

function parseCodeMeta(meta?: string | null) {
  const value = meta ?? "";
  const executable = /\bexec\b/.test(value);
  const id = value.match(/\bid=([A-Za-z0-9_-]+)/)?.[1];
  return { executable, id };
}

function parseAlignmentSegments(markdown: string): MarkdownSegment[] {
  const pattern = /(?:^|\n):::align-(left|center|right)\n([\s\S]*?)\n:::(?=\n|$)/g;
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(pattern)) {
    const fullMatch = match[0];
    const align = match[1] as Alignment;
    const content = match[2];
    const matchIndex = match.index ?? 0;
    const blockStart = fullMatch.startsWith("\n") ? matchIndex + 1 : matchIndex;

    if (blockStart > lastIndex) {
      segments.push({
        type: "markdown",
        content: markdown.slice(lastIndex, blockStart),
      });
    }

    segments.push({
      type: "aligned",
      align,
      content,
    });
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < markdown.length) {
    segments.push({
      type: "markdown",
      content: markdown.slice(lastIndex),
    });
  }

  return segments.filter((segment) => segment.content.trim().length > 0);
}

export function MarkdownRenderer({
  markdown,
  manifest,
  pageId,
  requester,
  allowExecution = false,
  className,
  fontPreset = "source-serif",
  typography,
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedMarkdown = useMemo(
    () => normalizeImageSizingMarkdown(normalizeYouTubeIframes(markdown)),
    [markdown],
  );
  const segments = useMemo(
    () => parseAlignmentSegments(normalizedMarkdown),
    [normalizedMarkdown],
  );
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

    let cancelled = false;

    const typeset = async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        if (cancelled) {
          return;
        }

        const mathJax = window.MathJax;
        if (mathJax?.typesetPromise) {
          if (mathJax.startup?.promise) {
            await mathJax.startup.promise.catch(() => undefined);
          }

          if (cancelled) {
            return;
          }

          mathJax.typesetClear?.([node]);
          await mathJax.typesetPromise([node]).catch(() => undefined);
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    };

    void typeset();

    return () => {
      cancelled = true;
    };
  }, [normalizedMarkdown]);

  return (
    <div
      ref={containerRef}
      className={cn("book-prose", className)}
      data-font-preset={fontPreset}
      style={bookTypographyStyle(typography)}
    >
      {segments.map((segment, index) => (
        <div
          key={`${segment.type}-${index}`}
          className={
            segment.type === "aligned"
              ? cn("alignment-block", `align-${segment.align}`)
              : undefined
          }
        >
          <ReactMarkdown
            remarkPlugins={[
              remarkGfm,
              [remarkMath, { singleDollarTextMath: true }],
              createWikiLinkPlugin((target) => manifestMap.get(target) ?? null),
            ]}
            rehypePlugins={[rehypeSlug]}
            components={{
              p: ({ children }) => {
                const content = Children.toArray(children).filter(
                  (child) => !(typeof child === "string" && child.trim() === ""),
                );

                if (content.length === 1) {
                  const child = content[0];
                  if (isValidElement<{ href?: string }>(child) && child.type === "img") {
                    return <div className="media-block">{child}</div>;
                  }

                  if (
                    isValidElement<{ href?: string }>(child) &&
                    typeof child.props.href === "string"
                  ) {
                    const videoId = extractYouTubeVideoId(child.props.href);
                    if (videoId) {
                      return (
                        <div className="youtube-embed">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="Embedded YouTube video"
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                          />
                        </div>
                      );
                    }
                  }
                }

                return <p>{children}</p>;
              },
              a: ({ className: linkClassName, ...props }) => (
                <a
                  {...props}
                  className={cn(
                    "transition-colors hover:text-[var(--paper-ink)]",
                    linkClassName,
                  )}
                />
              ),
              pre: ({ node, children }) => {
                const firstChild = node?.children?.[0];
                const classNames =
                  firstChild &&
                  "properties" in firstChild &&
                  Array.isArray(firstChild.properties.className)
                    ? firstChild.properties.className.join(" ")
                    : "";

                if (
                  classNames.includes("language-math") ||
                  classNames.includes("math-display")
                ) {
                  return <>{children}</>;
                }

                return <pre>{children}</pre>;
              },
              code: ({ node, className: codeClassName, children, ...props }) => {
                const inline = !node || node.position?.start.line === node.position?.end.line;
                const language = codeClassName?.replace("language-", "") ?? "text";
                const meta =
                  node && "meta" in node && typeof node.meta === "string"
                    ? node.meta
                    : undefined;
                const { executable, id } = parseCodeMeta(meta);
                const value = String(children).replace(/\n$/, "");
                const isInlineMath = codeClassName?.includes("math-inline") ?? false;
                const isDisplayMath = codeClassName?.includes("math-display") ?? false;
                const isMathNode =
                  isInlineMath ||
                  isDisplayMath ||
                  codeClassName?.includes("language-math");

                if (isMathNode) {
                  if (isDisplayMath) {
                    return <div className="math-display">{`\\[${value}\\]`}</div>;
                  }

                  if (isInlineMath || inline) {
                    return <span className="math-inline">{`\\(${value}\\)`}</span>;
                  }

                  return <div className="math-display">{`\\[${value}\\]`}</div>;
                }

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
              img: ({ className: imageClassName, alt, ...props }) => (
                (() => {
                  const sizing = parseImageSizingFromUrl(
                    typeof props.src === "string" ? props.src : "",
                  );
                  return (
                    <img
                      {...props}
                      src={sizing.src}
                      alt={alt ?? ""}
                      loading="lazy"
                      className={cn("book-image", imageClassName)}
                      style={{
                        width: sizing.width,
                        height: sizing.height,
                      }}
                    />
                  );
                })()
              ),
            }}
          >
            {segment.content}
          </ReactMarkdown>
        </div>
      ))}
    </div>
  );
}
