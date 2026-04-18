"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentTree } from "@/lib/content/schemas";

export type ContentTreeModel = {
  tree: ContentTree | null;
  revision: string | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch the tree + revision from the server. */
  refresh: () => Promise<void>;
};

type TreeResponse = {
  tree: ContentTree;
  revision: string;
};

/**
 * Loads the content tree + revision pair used to gate optimistic-concurrency
 * writes. Pass `initialTree`/`initialRevision` when a server component has
 * already hydrated the data to skip the first fetch.
 */
export function useContentTreeModel(options?: {
  initialTree?: ContentTree;
  initialRevision?: string;
}): ContentTreeModel {
  const [tree, setTree] = useState<ContentTree | null>(options?.initialTree ?? null);
  const [revision, setRevision] = useState<string | null>(
    options?.initialRevision ?? null,
  );
  const [loading, setLoading] = useState(!options?.initialTree);
  const [error, setError] = useState<string | null>(null);

  // Stable ref so repeated `refresh` calls share the same in-flight abort.
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/content/tree", {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Tree fetch failed (${response.status})`);
      }
      const payload = (await response.json()) as TreeResponse;
      setTree(payload.tree);
      setRevision(payload.revision);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Tree fetch failed");
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (options?.initialTree && options?.initialRevision) return;
    void refresh();
    return () => abortRef.current?.abort();
    // Only run on mount — `refresh` is stable (useCallback with []).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tree, revision, loading, error, refresh };
}
