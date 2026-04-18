"use client";

import { useCallback } from "react";
import type { ContentTreeModel } from "@/components/workspace/use-content-tree-model";
import {
  dispatchTreeDrop,
  type DropPosition,
  type NodeRef,
} from "@/components/workspace/tree-drop-dispatch";

export type TreeDropOutcome = { ok: true } | { ok: false; error: string };

/**
 * Executes a drag-drop gesture against the content API.
 *
 * Composes {@link dispatchTreeDrop} (pure mapping) with the fetch + refresh
 * round-trip. A 409 (stale revision) is surfaced as `ok: false` so the caller
 * can trigger a re-fetch and retry.
 */
export function useTreeDrop(model: ContentTreeModel) {
  return useCallback(
    async (
      source: NodeRef,
      destination: NodeRef,
      position: DropPosition,
    ): Promise<TreeDropOutcome> => {
      if (!model.tree) return { ok: false, error: "Content tree not loaded." };
      const plan = dispatchTreeDrop({
        source,
        destination,
        position,
        tree: model.tree,
        revision: model.revision,
      });
      if (!plan.ok) return plan;
      try {
        const response = await fetch(plan.call.url, {
          method: plan.call.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(plan.call.body),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return {
            ok: false,
            error: text || `Request failed (${response.status})`,
          };
        }
        await model.refresh();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Request failed",
        };
      }
    },
    [model],
  );
}
