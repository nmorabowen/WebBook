import rehypeSlug from "rehype-slug";
import ReactMarkdown from "react-markdown";
import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type HTMLAttributeAnchorTarget,
  type ReactNode,
} from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { HighlightedCode } from "@/components/markdown/highlighted-code";
import { CopyCodeButton } from "@/components/markdown/copy-code-button";
import { MermaidDiagram } from "@/components/markdown/mermaid-diagram";
import { PublicMathTrigger } from "@/components/markdown/public-math-trigger";
import { SeafileLinkCard } from "@/components/markdown/seafile-link-card";
import { bookTypographyStyle, type BookTypography } from "@/lib/book-typography";
import type { ManifestEntry } from "@/lib/content/schemas";
import type { FontPreset } from "@/lib/font-presets";
import {
  createWikiLinkPlugin,
  headingId,
  resolveWikiTargetFromManifest,
} from "@/lib/markdown/shared";
import {
  cn,
  extractYouTubeVideoId,
  normalizeImageSizingMarkdown,
  normalizeYouTubeIframes,
  parseInlineTextStyleHref,
  parseImageSizingFromUrl,
  parseSeafileShareUrl,
} from "@/lib/utils";

type PublicMarkdownRendererProps = {
  markdown: string;
  manifest: ManifestEntry[];
  pageId: string;
  className?: string;
  fontPreset?: FontPreset;
  typography?: Partial<BookTypography>;
  currentRoute?: string;
  linkTarget?: HTMLAttributeAnchorTarget;
  linkRel?: string;
};

type Alignment = "left" | "center" | "right";
type MediaLayoutKind = "media-left" | "media-right" | "media-split";
type MarkdownSegment =
  | { type: "markdown"; content: string; lineOffset: number }
  | { type: "aligned"; align: Alignment; content: string; lineOffset: number }
  | {
      type: "media";
      layout: MediaLayoutKind;
      leftContent: string;
      rightContent: string;
      leftLineOffset: number;
      rightLineOffset: number;
      leftWidth?: string;
      rightWidth?: string;
    };
type CalloutMeta = {
  label: string;
  tone: "note" | "tip" | "warning" | "danger" | "info";
  content: ReactNode[];
};

function parseCodeMeta(meta?: string | null) {
  const value = meta ?? "";
  const id = value.match(/\bid=([A-Za-z0-9_-]+)/)?.[1];
  return { id };
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

function normalizeNodeText(node: ReactNode) {
  return collectNodeText(node).replace(/\s+/g, " ").trim();
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
): { node: ReactNode; replaced: boolean } {
  if (typeof node === "string") {
    if (!markerPattern.test(node)) {
      return { node, replaced: false };
    }

    return {
      node: node.replace(markerPattern, ""),
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

      const result = replaceFirstCalloutMarker(child, markerPattern);
      if (result.replaced) {
        replaced = true;
      }

      return result.node;
    });

    return { node: nextChildren, replaced };
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    const result = replaceFirstCalloutMarker(node.props.children, markerPattern);
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
  const updatedChildren: ReactNode[] = [...childArray];
  const replacedTarget = replaceFirstCalloutMarker(
    updatedChildren[targetIndex],
    markerPattern,
  );
  updatedChildren[targetIndex] = replacedTarget.node;

  const content = updatedChildren
    .filter((child) => normalizeNodeText(child).length > 0)
    .reduce<ReactNode[]>((items, child) => {
      const currentText = normalizeNodeText(child);
      const previous = items[items.length - 1];
      if (previous && normalizeNodeText(previous) === currentText) {
        return items;
      }

      items.push(child);
      return items;
    }, []);

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

function normalizeLayoutWidth(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return `${normalized}%`;
  }

  if (/^\d+(\.\d+)?(px|%|rem|em|vw|vh|ch|fr)$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function parseDirectiveAttributes(raw: string) {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([a-zA-Z-]+)=([^\s]+)/g)) {
    const key = match[1]?.toLowerCase();
    const value = match[2]?.replace(/^['"]|['"]$/g, "");
    if (key && value) {
      attributes[key] = value;
    }
  }
  return attributes;
}

function splitMediaLayoutContent(content: string) {
  const separatorMatch = /\r?\n---\r?\n/.exec(content);
  if (separatorMatch && separatorMatch.index !== undefined) {
    const separatorIndex = separatorMatch.index;
    const separatorLength = separatorMatch[0].length;
    return {
      first: content.slice(0, separatorIndex),
      second: content.slice(separatorIndex + separatorLength),
      secondStart: separatorIndex + separatorLength,
    };
  }

  return {
    first: content,
    second: "",
    secondStart: content.length,
  };
}

function parseLayoutSegments(markdown: string): MarkdownSegment[] {
  const pattern =
    /(?:^|\n):::(align-(left|center|right)|media-(left|right|split))([^\n]*)\n([\s\S]*?)\n:::(?=\n|$)/g;
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(pattern)) {
    const fullMatch = match[0];
    const directive = match[1];
    const align = match[2] as Alignment | undefined;
    const mediaLayout = match[3] ? (`media-${match[3]}` as MediaLayoutKind) : undefined;
    const rawAttributes = match[4] ?? "";
    const content = match[5];
    const matchIndex = match.index ?? 0;
    const blockStart = fullMatch.startsWith("\n") ? matchIndex + 1 : matchIndex;

    if (blockStart > lastIndex) {
      segments.push({
        type: "markdown",
        content: markdown.slice(lastIndex, blockStart),
        lineOffset: lineNumberAt(markdown, lastIndex),
      });
    }

    const headerLength = `:::${directive}${rawAttributes}\n`.length;
    const contentStart = blockStart + headerLength;

    if (align) {
      segments.push({
        type: "aligned",
        align,
        content,
        lineOffset: lineNumberAt(markdown, contentStart),
      });
    } else if (mediaLayout) {
      const attributes = parseDirectiveAttributes(rawAttributes);
      const splitContent = splitMediaLayoutContent(content);
      const firstLineOffset = lineNumberAt(markdown, contentStart);
      const secondLineOffset = lineNumberAt(markdown, contentStart + splitContent.secondStart);

      if (mediaLayout === "media-left") {
        segments.push({
          type: "media",
          layout: mediaLayout,
          leftContent: splitContent.first,
          rightContent: splitContent.second,
          leftLineOffset: firstLineOffset,
          rightLineOffset: secondLineOffset,
          leftWidth: normalizeLayoutWidth(attributes.width),
        });
      } else if (mediaLayout === "media-right") {
        segments.push({
          type: "media",
          layout: mediaLayout,
          leftContent: splitContent.first,
          rightContent: splitContent.second,
          leftLineOffset: firstLineOffset,
          rightLineOffset: secondLineOffset,
          rightWidth: normalizeLayoutWidth(attributes.width),
        });
      } else {
        segments.push({
          type: "media",
          layout: mediaLayout,
          leftContent: splitContent.first,
          rightContent: splitContent.second,
          leftLineOffset: firstLineOffset,
          rightLineOffset: secondLineOffset,
          leftWidth: normalizeLayoutWidth(attributes.left),
          rightWidth: normalizeLayoutWidth(attributes.right),
        });
      }
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  if (lastIndex < markdown.length) {
    segments.push({
      type: "markdown",
      content: markdown.slice(lastIndex),
      lineOffset: lineNumberAt(markdown, lastIndex),
    });
  }

  return segments.filter((segment) => {
    if (segment.type === "media") {
      return (
        segment.leftContent.trim().length > 0 || segment.rightContent.trim().length > 0
      );
    }

    return segment.content.trim().length > 0;
  });
}

function sourceLine(node?: { position?: { start?: { line?: number } } }) {
  return node?.position?.start?.line;
}

export function PublicMarkdownRenderer({
  markdown,
  manifest,
  pageId,
  className,
  fontPreset = "source-serif",
  typography,
  currentRoute,
  linkTarget,
  linkRel,
}: PublicMarkdownRendererProps) {
  const normalizedMarkdown = normalizeImageSizingMarkdown(normalizeYouTubeIframes(markdown));
  const segments = parseLayoutSegments(normalizedMarkdown);
  const resolveWikiTarget = (target: string) => {
    const trimmedTarget = target.trim();
    if (!trimmedTarget) {
      return null;
    }

    if (trimmedTarget.startsWith("#")) {
      if (!currentRoute) {
        return null;
      }

      const headingValue = trimmedTarget.slice(1).trim();
      if (!headingValue) {
        return null;
      }

      return {
        route: `${currentRoute}#${headingId(headingValue)}`,
        title: headingValue,
      };
    }

    const hashIndex = trimmedTarget.indexOf("#");
    if (hashIndex > 0) {
      const baseTarget = trimmedTarget.slice(0, hashIndex).trim();
      const headingValue = trimmedTarget.slice(hashIndex + 1).trim();
      const resolvedBase = resolveWikiTargetFromManifest(manifest, baseTarget);

      if (!resolvedBase || !headingValue) {
        return null;
      }

      return {
        route: `${resolvedBase.route}#${headingId(headingValue)}`,
        title: `${resolvedBase.title} → ${headingValue}`,
      };
    }

    return resolveWikiTargetFromManifest(manifest, trimmedTarget);
  };

  const renderMarkdownFragment = (segmentContent: string, segmentLineOffset: number) => {
    const segmentSourceLine = (node?: { position?: { start?: { line?: number } } }) => {
      const line = sourceLine(node);
      return line ? segmentLineOffset + line - 1 : undefined;
    };

    return (
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: true }],
          createWikiLinkPlugin(resolveWikiTarget),
        ]}
        rehypePlugins={[rehypeSlug]}
        components={{
          a: ({ className: linkClassName, ...props }) =>
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
                  target={
                    typeof props.href === "string" && props.href.startsWith("#")
                      ? undefined
                      : linkTarget
                  }
                  rel={
                    typeof props.href === "string" && props.href.startsWith("#")
                      ? undefined
                      : linkRel
                  }
                  className={cn(
                    "transition-colors hover:text-[var(--paper-ink)]",
                    linkClassName,
                  )}
                />
              );
            })(),
          p: ({ node, children }) => {
            const content = Children.toArray(children).filter(
              (child) => !(typeof child === "string" && child.trim() === ""),
            );
            const line = segmentSourceLine(node);

            if (content.length === 1) {
              const child = content[0];
              if (isValidElement<{ href?: string }>(child) && child.type === "img") {
                return <div className="media-block" data-source-line={line}>{child}</div>;
              }

              if (
                isValidElement<{ href?: string; children?: ReactNode }>(child) &&
                typeof child.props.href === "string"
              ) {
                const videoId = extractYouTubeVideoId(child.props.href);
                if (videoId) {
                  return (
                    <div className="youtube-embed" data-source-line={line}>
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

                const seafile = parseSeafileShareUrl(child.props.href);
                if (seafile) {
                  const label = normalizeNodeText(child.props.children);
                  return (
                    <div className="seafile-link-card-block" data-source-line={line}>
                      <SeafileLinkCard
                        info={seafile}
                        label={label || undefined}
                        target={linkTarget}
                        rel={linkRel}
                      />
                    </div>
                  );
                }
              }
            }

            return <p data-source-line={line}>{children}</p>;
          },
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
              classNames.includes("math-display") ||
              classNames.includes("language-mermaid")
            ) {
              return <>{children}</>;
            }

            return <pre data-source-line={segmentSourceLine(node)}>{children}</pre>;
          },
          code: ({ node, className: codeClassName, children, ...props }) => {
            const inline = !node || node.position?.start.line === node.position?.end.line;
            const language = codeClassName?.replace("language-", "") ?? "text";
            const meta =
              node && "meta" in node && typeof node.meta === "string"
                ? node.meta
                : undefined;
            const { id } = parseCodeMeta(meta);
            const value = String(children).replace(/\n$/, "");
            const isInlineMath = codeClassName?.includes("math-inline") ?? false;
            const isDisplayMath = codeClassName?.includes("math-display") ?? false;
            const isMathNode =
              isInlineMath ||
              isDisplayMath ||
              codeClassName?.includes("language-math");

            if (isMathNode) {
              if (isDisplayMath) {
                return (
                  <div className="math-display" data-source-line={segmentSourceLine(node)}>
                    {`\\[${value}\\]`}
                  </div>
                );
              }

              if (isInlineMath || inline) {
                return <span className="math-inline">{`\\(${value}\\)`}</span>;
              }

              return (
                <div className="math-display" data-source-line={segmentSourceLine(node)}>
                  {`\\[${value}\\]`}
                </div>
              );
            }

            if (inline) {
              return (
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              );
            }

            if (language === "mermaid") {
              return (
                <MermaidDiagram
                  code={value}
                  id={id}
                  sourceLine={segmentSourceLine(node)}
                />
              );
            }

            return (
              <div className="code-block-frame" data-source-line={segmentSourceLine(node)}>
                <div className="code-block-shell">
                  <div className="code-block-header">
                    <span className="code-block-language">{language}</span>
                    <CopyCodeButton code={value} />
                  </div>
                  <pre data-source-line={segmentSourceLine(node)}>
                    <HighlightedCode
                      code={value}
                      language={language}
                      className={codeClassName}
                    />
                  </pre>
                </div>
              </div>
            );
          },
          blockquote: ({ node, children, ...props }) =>
            (() => {
              const line = segmentSourceLine(node);
              const callout = extractCallout(children);
              if (!callout) {
                return (
                  <blockquote data-source-line={line} {...props}>
                    {children}
                  </blockquote>
                );
              }

              return (
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
                </div>
              );
            })(),
          table: ({ node, children, ...props }) => {
            const line = segmentSourceLine(node);
            return (
              <div className="markdown-table-wrap" data-source-line={line}>
                <table data-source-line={line} {...props}>
                  {children}
                </table>
              </div>
            );
          },
          img: ({ node, className: imageClassName, alt, ...props }) =>
            (() => {
              const sizing = parseImageSizingFromUrl(
                typeof props.src === "string" ? props.src : "",
              );
              return (
                // eslint-disable-next-line @next/next/no-img-element
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
            })(),
        }}
      >
        {segmentContent}
      </ReactMarkdown>
    );
  };

  return (
    <PublicMathTrigger
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
              : segment.type === "media"
                ? cn("media-layout-block", segment.layout)
                : undefined
          }
          style={
            segment.type === "media"
              ? ({
                  "--media-layout-left-width":
                    segment.leftWidth ??
                    (segment.layout === "media-left" ? "38%" : "minmax(0, 1fr)"),
                  "--media-layout-right-width":
                    segment.rightWidth ??
                    (segment.layout === "media-right" ? "38%" : "minmax(0, 1fr)"),
                } as CSSProperties)
              : undefined
          }
        >
          {segment.type === "media" ? (
            <div className="media-layout-inner">
              <div
                className={cn(
                  "media-layout-pane",
                  segment.layout === "media-left" ? "media-layout-pane-media" : undefined,
                )}
              >
                {segment.leftContent.trim().length > 0
                  ? renderMarkdownFragment(segment.leftContent, segment.leftLineOffset)
                  : null}
              </div>
              <div
                className={cn(
                  "media-layout-pane",
                  segment.layout === "media-right" ? "media-layout-pane-media" : undefined,
                )}
              >
                {segment.rightContent.trim().length > 0
                  ? renderMarkdownFragment(segment.rightContent, segment.rightLineOffset)
                  : null}
              </div>
            </div>
          ) : (
            renderMarkdownFragment(segment.content, segment.lineOffset)
          )}
        </div>
      ))}
    </PublicMathTrigger>
  );
}
