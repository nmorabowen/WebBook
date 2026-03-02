"use client";

import rehypeSlug from "rehype-slug";
import ReactMarkdown from "react-markdown";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
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
  parseInlineTextStyleHref,
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
  sourceNavigation?: boolean;
};
type Alignment = "left" | "center" | "right";
type MarkdownSegment =
  | { type: "markdown"; content: string; lineOffset: number }
  | { type: "aligned"; align: Alignment; content: string; lineOffset: number };
type CalloutMeta = {
  label: string;
  tone: "note" | "tip" | "warning" | "danger" | "info";
  content: ReactNode[];
};

function headingDepthFromTagName(tagName: string) {
  if (!/^H[1-4]$/.test(tagName)) {
    return null;
  }

  return Number(tagName.slice(1));
}

function resolveRenderedBlock(
  element: Element,
): { renderedElement: HTMLElement | null; indentTarget: HTMLElement | null } {
  if (!(element instanceof HTMLElement)) {
    return { renderedElement: null, indentTarget: null };
  }

  if (element.classList.contains("source-nav-block")) {
    const content = element.querySelector(":scope > .source-nav-content");
    const rendered = content?.firstElementChild;
    return {
      renderedElement: rendered instanceof HTMLElement ? rendered : null,
      indentTarget: content instanceof HTMLElement ? content : null,
    };
  }

  return {
    renderedElement: element,
    indentTarget: element,
  };
}

function applySectionIndentation(parent: HTMLElement, currentDepth = 1): number {
  let activeDepth = currentDepth;

  for (const child of Array.from(parent.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    if (child.classList.contains("alignment-block")) {
      activeDepth = applySectionIndentation(child, activeDepth);
      continue;
    }

    const { renderedElement, indentTarget } = resolveRenderedBlock(child);
    if (!renderedElement || !indentTarget) {
      continue;
    }

    const headingDepth = headingDepthFromTagName(renderedElement.tagName);
    if (headingDepth) {
      activeDepth = headingDepth;
      indentTarget.style.removeProperty("--section-indent-level");
      indentTarget.removeAttribute("data-section-indented");
      continue;
    }

    const indentLevel = Math.max(activeDepth - 1, 0);
    indentTarget.style.setProperty("--section-indent-level", String(indentLevel));
    if (indentLevel > 0) {
      indentTarget.setAttribute("data-section-indented", "true");
    } else {
      indentTarget.removeAttribute("data-section-indented");
    }
  }

  return activeDepth;
}

function sourceLine(node?: { position?: { start?: { line?: number } } }) {
  return node?.position?.start?.line;
}

function parseCodeMeta(meta?: string | null) {
  const value = meta ?? "";
  const executable = /\bexec\b/.test(value);
  const id = value.match(/\bid=([A-Za-z0-9_-]+)/)?.[1];
  return { executable, id };
}

function collectNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(collectNodeText).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return collectNodeText(node.props.children);
  }

  return "";
}

function calloutTone(label: string): CalloutMeta["tone"] {
  const normalized = label.toLowerCase();
  if (["warning", "caution", "attention"].includes(normalized)) {
    return "warning";
  }

  if (["danger", "error", "fail", "failure", "bug"].includes(normalized)) {
    return "danger";
  }

  if (["tip", "hint", "success", "check"].includes(normalized)) {
    return "tip";
  }

  if (["info", "todo", "abstract", "summary"].includes(normalized)) {
    return "info";
  }

  return "note";
}

function replaceFirstCalloutMarker(
  node: ReactNode,
  markerPattern: RegExp,
  replacement: string,
): { node: ReactNode; replaced: boolean } {
  if (typeof node === "string") {
    if (!markerPattern.test(node)) {
      return { node, replaced: false };
    }

    return {
      node: node.replace(markerPattern, replacement),
      replaced: true,
    };
  }

  if (typeof node === "number" || node === null || node === undefined) {
    return { node, replaced: false };
  }

  if (Array.isArray(node)) {
    let replaced = false;
    const nextChildren = node.map((child) => {
      if (replaced) {
        return child;
      }

      const result = replaceFirstCalloutMarker(child, markerPattern, replacement);
      if (result.replaced) {
        replaced = true;
      }
      return result.node;
    });

    return { node: nextChildren, replaced };
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const result = replaceFirstCalloutMarker(node.props.children, markerPattern, replacement);
    if (!result.replaced) {
      return { node, replaced: false };
    }

    return {
      node: cloneElement(node, {
        children: result.node ?? null,
      }),
      replaced: true,
    };
  }

  return { node, replaced: false };
}

function extractCallout(children: ReactNode): CalloutMeta | null {
  const childArray = Children.toArray(children);
  let targetIndex = -1;
  let firstText = "";

  for (let index = 0; index < childArray.length; index += 1) {
    const candidateText = collectNodeText(childArray[index]).trim();
    if (!candidateText) {
      continue;
    }

    targetIndex = index;
    firstText = candidateText;
    break;
  }

  const match = firstText.match(/^\[!([^\]]+)\]\s*(.*)$/);
  if (!match || targetIndex === -1) {
    return null;
  }

  const label = match[1].replace(/[:!]+$/g, "").trim() || "NOTE";
  const markerPattern = /^\s*\[![^\]]+\]\s*/;
  const replacement = match[2].trim();
  const updatedChildren: ReactNode[] = [...childArray];
  const replacedTarget = replaceFirstCalloutMarker(
    updatedChildren[targetIndex],
    markerPattern,
    replacement,
  );
  updatedChildren[targetIndex] = replacedTarget.node;
  const content = updatedChildren.filter((child) => collectNodeText(child).trim().length > 0);

  return {
    label: label.toUpperCase(),
    tone: calloutTone(label),
    content,
  };
}

function lineNumberAt(content: string, index: number) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content[cursor] === "\n") {
      line += 1;
    }
  }

  return line;
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
        lineOffset: lineNumberAt(markdown, lastIndex),
      });
    }

    const contentStart = blockStart + `:::align-${align}\n`.length;
    segments.push({
      type: "aligned",
      align,
      content,
      lineOffset: lineNumberAt(markdown, contentStart),
    });
    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < markdown.length) {
    segments.push({
      type: "markdown",
      content: markdown.slice(lastIndex),
      lineOffset: lineNumberAt(markdown, lastIndex),
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
  sourceNavigation = false,
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

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    applySectionIndentation(node);
  }, [normalizedMarkdown, sourceNavigation]);

  useEffect(() => {
    if (!sourceNavigation || typeof window === "undefined") {
      return;
    }

    let highlightTimer: number | undefined;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        data.type !== "webbook-editor-preview-line" ||
        typeof data.line !== "number"
      ) {
        return;
      }

      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>("[data-source-line]"),
      ).filter((element) => {
        const line = Number(element.dataset.sourceLine);
        return Number.isFinite(line);
      });

      if (!nodes.length) {
        return;
      }

      const requestedLine = data.line;
      const target =
        nodes.find((element) => Number(element.dataset.sourceLine) >= requestedLine) ??
        nodes[nodes.length - 1];

      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("source-nav-target");
      if (highlightTimer) {
        window.clearTimeout(highlightTimer);
      }
      highlightTimer = window.setTimeout(() => {
        target.classList.remove("source-nav-target");
      }, 1400);
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (highlightTimer) {
        window.clearTimeout(highlightTimer);
      }
    };
  }, [sourceNavigation]);

  const wrapWithSourceNavigation = (
    line: number | undefined,
    content: ReactNode,
    className?: string,
  ) => {
    if (!sourceNavigation || !line) {
      return content;
    }

    return (
      <div className={cn("source-nav-block", className)} data-source-line={line}>
        <button
          type="button"
          className="source-nav-dot"
          aria-label={`Jump to source line ${line}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            window.parent.postMessage(
              { type: "webbook-preview-source-line", line },
              window.location.origin,
            );
          }}
        />
        <div className="source-nav-content">{content}</div>
      </div>
    );
  };

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
          {(() => {
            const segmentSourceLine = (node?: { position?: { start?: { line?: number } } }) => {
              const line = sourceLine(node);
              return line ? segment.lineOffset + line - 1 : undefined;
            };

            return (
          <ReactMarkdown
            remarkPlugins={[
              remarkGfm,
              [remarkMath, { singleDollarTextMath: true }],
              createWikiLinkPlugin((target) => manifestMap.get(target) ?? null),
            ]}
            rehypePlugins={[rehypeSlug]}
            components={{
              h1: ({ node, children, ...props }) =>
                wrapWithSourceNavigation(
                  segmentSourceLine(node),
                  <h1 data-source-line={segmentSourceLine(node)} {...props}>
                    {children}
                  </h1>,
                ),
              h2: ({ node, children, ...props }) =>
                wrapWithSourceNavigation(
                  segmentSourceLine(node),
                  <h2 data-source-line={segmentSourceLine(node)} {...props}>
                    {children}
                  </h2>,
                ),
              h3: ({ node, children, ...props }) =>
                wrapWithSourceNavigation(
                  segmentSourceLine(node),
                  <h3 data-source-line={segmentSourceLine(node)} {...props}>
                    {children}
                  </h3>,
                ),
              h4: ({ node, children, ...props }) =>
                wrapWithSourceNavigation(
                  segmentSourceLine(node),
                  <h4 data-source-line={segmentSourceLine(node)} {...props}>
                    {children}
                  </h4>,
                ),
              p: ({ node, children }) => {
                const content = Children.toArray(children).filter(
                  (child) => !(typeof child === "string" && child.trim() === ""),
                );
                const line = segmentSourceLine(node);

                if (content.length === 1) {
                  const child = content[0];
                  if (isValidElement<{ href?: string }>(child) && child.type === "img") {
                    return wrapWithSourceNavigation(
                      line,
                      <div className="media-block" data-source-line={line}>
                        {child}
                      </div>,
                      "source-nav-media",
                    );
                  }

                  if (
                    isValidElement<{ href?: string }>(child) &&
                    typeof child.props.href === "string"
                  ) {
                    const videoId = extractYouTubeVideoId(child.props.href);
                    if (videoId) {
                      return wrapWithSourceNavigation(
                        line,
                        <div className="youtube-embed" data-source-line={line}>
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="Embedded YouTube video"
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                          />
                        </div>,
                        "source-nav-media",
                      );
                    }
                  }
                }

                return wrapWithSourceNavigation(
                  line,
                  <p data-source-line={line}>{children}</p>,
                );
              },
              a: ({ className: linkClassName, ...props }) => (
                (() => {
                  const styleLink =
                    typeof props.href === "string"
                      ? parseInlineTextStyleHref(props.href)
                      : null;

                  if (styleLink) {
                    return (
                      <span
                        className="inline-text-style"
                        style={{
                          color: styleLink.color,
                          fontSize: styleLink.size,
                        }}
                      >
                        {props.children}
                      </span>
                    );
                  }

                  return (
                    <a
                      {...props}
                      className={cn(
                        "transition-colors hover:text-[var(--paper-ink)]",
                        linkClassName,
                      )}
                    />
                  );
                })()
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

                return wrapWithSourceNavigation(
                  segmentSourceLine(node),
                  <pre data-source-line={segmentSourceLine(node)}>{children}</pre>,
                );
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
                    return wrapWithSourceNavigation(
                      segmentSourceLine(node),
                      <div
                        className="math-display"
                        data-source-line={segmentSourceLine(node)}
                      >
                        {`\\[${value}\\]`}
                      </div>,
                    );
                  }

                  if (isInlineMath || inline) {
                    return <span className="math-inline">{`\\(${value}\\)`}</span>;
                  }

                  return wrapWithSourceNavigation(
                    segmentSourceLine(node),
                    <div
                      className="math-display"
                      data-source-line={segmentSourceLine(node)}
                    >
                      {`\\[${value}\\]`}
                    </div>,
                  );
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

                return wrapWithSourceNavigation(
                  segmentSourceLine(node),
                  <pre data-source-line={segmentSourceLine(node)}>
                    <code className={codeClassName} {...props}>
                      {children}
                    </code>
                  </pre>,
                );
              },
              blockquote: ({ node, children, ...props }) =>
                (() => {
                  const line = segmentSourceLine(node);
                  const callout = extractCallout(children);
                  if (!callout) {
                    return wrapWithSourceNavigation(
                      line,
                      <blockquote data-source-line={line} {...props}>
                        {children}
                      </blockquote>,
                    );
                  }

                  return wrapWithSourceNavigation(
                    line,
                    <div
                      className={cn("callout-block", `callout-${callout.tone}`)}
                      data-source-line={line}
                    >
                      <div className="callout-header">
                        <span className="callout-label">{callout.label}</span>
                      </div>
                      {callout.content.length ? (
                        <div className="callout-content">{callout.content}</div>
                      ) : null}
                    </div>,
                  );
                })(),
              ul: ({ node, children, ...props }) => (
                <ul data-source-line={segmentSourceLine(node)} {...props}>
                  {children}
                </ul>
              ),
              ol: ({ node, children, ...props }) => (
                <ol data-source-line={segmentSourceLine(node)} {...props}>
                  {children}
                </ol>
              ),
              li: ({ node, children, ...props }) => (
                <li data-source-line={segmentSourceLine(node)} {...props}>
                  {children}
                </li>
              ),
              img: ({ node, className: imageClassName, alt, ...props }) => (
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
                      data-source-line={segmentSourceLine(node)}
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
            );
          })()}
        </div>
      ))}
    </div>
  );
}
