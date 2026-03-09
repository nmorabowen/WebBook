export type PreviewSyncState = {
  anchorLine: number | null;
  renderedLine: number | null;
  pendingRestoreLine: number | null;
  restoreRequestSent: boolean;
};

export function createPreviewSyncState(): PreviewSyncState {
  return {
    anchorLine: null,
    renderedLine: null,
    pendingRestoreLine: null,
    restoreRequestSent: false,
  };
}

export function setPreviewAnchorLine(
  state: PreviewSyncState,
  line: number,
): PreviewSyncState {
  return {
    ...state,
    anchorLine: line,
    pendingRestoreLine: null,
    restoreRequestSent: false,
  };
}

export function setRenderedPreviewLine(
  state: PreviewSyncState,
  line: number,
): PreviewSyncState {
  return {
    anchorLine: line,
    renderedLine: line,
    pendingRestoreLine: null,
    restoreRequestSent: false,
  };
}

export function beginPreviewReload(
  state: PreviewSyncState,
): PreviewSyncState {
  if (state.anchorLine === null) {
    return {
      ...state,
      pendingRestoreLine: null,
      restoreRequestSent: false,
    };
  }

  return {
    ...state,
    pendingRestoreLine: state.anchorLine,
    restoreRequestSent: false,
  };
}

export function applyPreviewVisibleLineUpdate(
  state: PreviewSyncState,
  line: number,
): {
  nextState: PreviewSyncState;
  restoreLineToSend: number | null;
} {
  if (state.pendingRestoreLine !== null && !state.restoreRequestSent) {
    return {
      nextState: {
        ...state,
        renderedLine: line,
        restoreRequestSent: true,
      },
      restoreLineToSend: state.pendingRestoreLine,
    };
  }

  return {
    nextState: setRenderedPreviewLine(state, line),
    restoreLineToSend: null,
  };
}
