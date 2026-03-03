import matter from "gray-matter";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";
import type { Root } from "mdast";
import type { ManifestEntry } from "@/lib/content/schemas";

export type TocItem = {
  depth: number;
  value: string;
  id: string;
};

export type CodeCell = {
  id: string;
  language: string;
  source: string;
  executable: boolean;
  runtime?: "python";
};

export type ResolvedWikiTarget = {
  route: string;
  title: string;
};

type Resolver = (target: string) => ResolvedWikiTarget | null;

export function headingId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

export function splitWikiTarget(target: string) {
  const [rawTarget, ...headingParts] = target.split("#");
  return {
    pageTarget: rawTarget.trim(),
    headingTarget: headingParts.join("#").trim() || undefined,
  };
}

function normalizeHeadingQuery(value: string) {
  return headingId(value);
}

export function resolveWikiTargetFromManifest(
  manifest: ManifestEntry[],
  target: string,
): ResolvedWikiTarget | null {
  const { pageTarget, headingTarget } = splitWikiTarget(target);
  if (!pageTarget && !headingTarget) {
    return null;
  }

  const normalizedPageTarget = pageTarget.toLowerCase();
  const entry =
    manifest.find((candidate) => {
      if (candidate.slug === normalizedPageTarget) {
        return true;
      }

      return (
        candidate.kind === "chapter" &&
        candidate.bookSlug &&
        `${candidate.bookSlug}/${candidate.slug}` === normalizedPageTarget
      );
    }) ?? null;

  if (!entry) {
    return null;
  }

  if (!headingTarget) {
    return {
      route: entry.route,
      title: entry.title,
    };
  }

  const normalizedHeadingTarget = normalizeHeadingQuery(headingTarget);
  const heading = entry.headings?.find(
    (candidate) =>
      candidate.id === normalizedHeadingTarget ||
      normalizeHeadingQuery(candidate.value) === normalizedHeadingTarget,
  );

  if (!heading) {
    return null;
  }

  return {
    route: `${entry.route}#${heading.id}`,
    title: heading.value,
  };
}

export function createWikiLinkPlugin(resolve: Resolver) {
  return function wikiLinkPlugin() {
    return (tree: Root) => {
      visit(tree, "text", (node, index, parent) => {
        if (!parent || typeof index !== "number") {
          return;
        }
        const value = node.value;
        if (!value.includes("[[")) {
          return;
        }

        const pattern = /\[\[([^[\]]+)\]\]/g;
        const replacements: Root["children"] = [];
        let lastIndex = 0;
        let match = pattern.exec(value);

        while (match) {
          if (match.index > lastIndex) {
            replacements.push({
              type: "text",
              value: value.slice(lastIndex, match.index),
            });
          }
          const target = match[1].trim();
          const resolved = resolve(target);
          replacements.push({
            type: "link",
            url: resolved?.route ?? "#",
            title: target,
            data: {
              hProperties: {
                className: resolved ? ["wiki-link"] : ["wiki-link", "is-broken"],
                "data-unresolved": resolved ? undefined : "true",
              },
            },
            children: [{ type: "text", value: resolved?.title ?? target }],
          });
          lastIndex = match.index + match[0].length;
          match = pattern.exec(value);
        }

        if (lastIndex < value.length) {
          replacements.push({
            type: "text",
            value: value.slice(lastIndex),
          });
        }

        parent.children.splice(index, 1, ...replacements);
      });
    };
  };
}

export function extractToc(markdown: string) {
  const parsed = matter(markdown);
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(parsed.content) as Root;
  const toc: TocItem[] = [];
  visit(tree, "heading", (node) => {
    const value = toString(node).replace(/\s+/g, " ").trim();
    if (!value) {
      return;
    }
    toc.push({
      depth: node.depth,
      value,
      id: headingId(value),
    });
  });
  return toc;
}

export function extractCodeCells(markdown: string) {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .parse(markdown) as Root;
  const codeCells: CodeCell[] = [];
  visit(tree, "code", (node) => {
    const meta = node.meta ?? "";
    const executable = /\bexec\b/.test(meta);
    const idMatch = meta.match(/\bid=([A-Za-z0-9_-]+)/);
    const language = node.lang ?? "text";
    codeCells.push({
      id: idMatch?.[1] ?? `${language}-${codeCells.length + 1}`,
      language,
      source: node.value,
      executable,
      runtime: executable && language === "python" ? "python" : undefined,
    });
  });
  return codeCells;
}
