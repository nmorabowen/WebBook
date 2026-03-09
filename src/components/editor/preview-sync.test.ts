import { describe, expect, it } from "vitest";
import {
  applyPreviewVisibleLineUpdate,
  beginPreviewReload,
  createPreviewSyncState,
  setPreviewAnchorLine,
  setRenderedPreviewLine,
} from "@/components/editor/preview-sync";

describe("preview sync state", () => {
  it("queues the current anchor for restore when the preview reloads", () => {
    const anchored = setPreviewAnchorLine(createPreviewSyncState(), 24);

    expect(beginPreviewReload(anchored)).toEqual({
      anchorLine: 24,
      renderedLine: null,
      pendingRestoreLine: 24,
      restoreRequestSent: false,
    });
  });

  it("requests a restore on the first visible-line update after reload", () => {
    const reloading = beginPreviewReload(
      setRenderedPreviewLine(createPreviewSyncState(), 18),
    );

    const update = applyPreviewVisibleLineUpdate(reloading, 1);

    expect(update.restoreLineToSend).toBe(18);
    expect(update.nextState).toEqual({
      anchorLine: 18,
      renderedLine: 1,
      pendingRestoreLine: 18,
      restoreRequestSent: true,
    });
  });

  it("tracks the actual rendered line once restore or scrolling settles", () => {
    const pendingRestore = {
      anchorLine: 18,
      renderedLine: 1,
      pendingRestoreLine: 18,
      restoreRequestSent: true,
    };

    const update = applyPreviewVisibleLineUpdate(pendingRestore, 22);

    expect(update.restoreLineToSend).toBeNull();
    expect(update.nextState).toEqual({
      anchorLine: 22,
      renderedLine: 22,
      pendingRestoreLine: null,
      restoreRequestSent: false,
    });
  });
});
