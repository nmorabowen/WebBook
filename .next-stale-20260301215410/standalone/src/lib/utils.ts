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
