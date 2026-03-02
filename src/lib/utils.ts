import { formatDistanceToNowStrict } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import slugify from "slugify";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toSlug(input: string) {
  return slugify(input, {
    lower: true,
    strict: true,
    trim: true,
  });
}

export function isSafeSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function formatRelativeDate(isoDate?: string) {
  if (!isoDate) {
    return "Never";
  }

  return formatDistanceToNowStrict(new Date(isoDate), {
    addSuffix: true,
  });
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/[#>*_`[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractYouTubeVideoId(url: string) {
  try {
    const normalized = url.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.includes("<iframe")) {
      const srcMatch = normalized.match(/\ssrc=["']([^"']+)["']/i);
      if (!srcMatch?.[1]) {
        return null;
      }
      return extractYouTubeVideoId(srcMatch[1]);
    }

    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || null;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }

      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeYouTubeEmbedInput(input: string) {
  const videoId = extractYouTubeVideoId(input);
  if (!videoId) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function normalizeYouTubeIframes(markdown: string) {
  return markdown.replace(/<iframe[\s\S]*?<\/iframe>/gi, (value) => {
    const normalized = normalizeYouTubeEmbedInput(value);
    return normalized ? `\n${normalized}\n` : value;
  });
}

function normalizeImageDimensionValue(key: "width" | "height", value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "auto") {
    return "auto";
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return key === "width" ? `${normalized}%` : `${normalized}px`;
  }

  if (/^\d+(\.\d+)?(px|%|rem|em|vw|vh)$/.test(normalized)) {
    return normalized;
  }

  return null;
}

function appendImageSizingMarker(
  url: string,
  dimensions: { width?: string; height?: string },
) {
  const entries = Object.entries(dimensions).filter((entry): entry is [string, string] =>
    Boolean(entry[1]),
  );
  if (!entries.length) {
    return url;
  }

  const marker = `wb:${entries
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join(";")}`;

  return url.includes("#") ? `${url}|${marker}` : `${url}#${marker}`;
}

export function normalizeImageSizingMarkdown(markdown: string) {
  return markdown.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\{([^}]*)\}/g,
    (_match, alt: string, url: string, title: string | undefined, rawAttributes: string) => {
      const attributes = rawAttributes
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const dimensions: { width?: string; height?: string } = {};

      for (const attribute of attributes) {
        const [rawKey, rawValue] = attribute.split("=");
        if (!rawKey || !rawValue) {
          continue;
        }

        const key = rawKey.toLowerCase();
        if (key !== "width" && key !== "height" && key !== "w" && key !== "h") {
          continue;
        }

        const dimensionKey = key === "w" ? "width" : key === "h" ? "height" : key;
        const normalized = normalizeImageDimensionValue(
          dimensionKey,
          rawValue.replace(/^['"]|['"]$/g, ""),
        );
        if (normalized) {
          dimensions[dimensionKey] = normalized;
        }
      }

      const nextUrl = appendImageSizingMarker(url, dimensions);
      const titlePart = title ? ` "${title}"` : "";
      return `![${alt}](${nextUrl}${titlePart})`;
    },
  );
}

export function parseImageSizingFromUrl(url: string) {
  const pipeMarkerIndex = url.lastIndexOf("|wb:");
  const hashMarkerIndex = url.lastIndexOf("#wb:");
  const markerIndex = pipeMarkerIndex >= 0 ? pipeMarkerIndex : hashMarkerIndex;

  if (markerIndex < 0) {
    return {
      src: url,
      width: undefined,
      height: undefined,
    };
  }

  const src = url.slice(0, markerIndex);
  const marker = url.slice(markerIndex + 4);
  const dimensions: { width?: string; height?: string } = {};

  for (const entry of marker.split(";")) {
    const [key, value] = entry.split("=");
    if (!key || !value) {
      continue;
    }

    if (key === "width" || key === "height") {
      dimensions[key] = decodeURIComponent(value);
    }
  }

  return {
    src,
    width: dimensions.width,
    height: dimensions.height,
  };
}
