"use client";

import { useCallback } from "react";
import type { ContentTreeModel } from "@/components/workspace/use-content-tree-model";
import type { NodeRef } from "@/components/workspace/tree-drop-dispatch";

export type ActionOutcome = { ok: true } | { ok: false; error: string };

function encodePath(parts: string[]) {
  return parts.map((p) => encodeURIComponent(p)).join("/");
}

/**
 * Tree-row context-menu actions: delete, demote chapter→note, promote note→chapter.
 * Each action re-fetches the tree on success so the UI reflects the new state.
 */
export function useTreeActions(model: ContentTreeModel) {
  const refresh = model.refresh;

  const doRequest = useCallback(
    async (url: string, init: RequestInit): Promise<ActionOutcome> => {
      try {
        const response = await fetch(url, init);
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return {
            ok: false,
            error: text || `Request failed (${response.status})`,
          };
        }
        await refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Request failed",
        };
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (ref: NodeRef): Promise<ActionOutcome> => {
      if (ref.kind === "notes-root") {
        return { ok: false, error: "Cannot delete the notes section." };
      }
      const rev = model.revision ?? undefined;
      const body = JSON.stringify({ revision: rev });
      const init: RequestInit = {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body,
      };
      if (ref.kind === "book") {
        return doRequest(`/api/books/${encodeURIComponent(ref.slug)}`, init);
      }
      if (ref.kind === "note") {
        return doRequest(`/api/notes/${encodeURIComponent(ref.slug)}`, init);
      }
      return doRequest(
        `/api/books/${encodeURIComponent(ref.bookSlug)}/chapters/${encodePath(ref.chapterPath)}`,
        init,
      );
    },
    [doRequest, model.revision],
  );

  const demoteChapterToNote = useCallback(
    async (ref: NodeRef): Promise<ActionOutcome> => {
      if (ref.kind !== "chapter") {
        return { ok: false, error: "Only chapters can be demoted to notes." };
      }
      return doRequest("/api/notes/from-chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookSlug: ref.bookSlug,
          chapterPath: ref.chapterPath,
          revision: model.revision ?? undefined,
        }),
      });
    },
    [doRequest, model.revision],
  );

  const promoteNoteToBook = useCallback(
    async (ref: NodeRef, destinationBookSlug: string): Promise<ActionOutcome> => {
      if (ref.kind !== "note") {
        return { ok: false, error: "Only notes can be promoted to chapters." };
      }
      return doRequest(`/api/notes/${encodeURIComponent(ref.slug)}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationBookSlug,
          parentChapterPath: [],
          revision: model.revision ?? undefined,
        }),
      });
    },
    [doRequest, model.revision],
  );

  return { remove, demoteChapterToNote, promoteNoteToBook };
}
