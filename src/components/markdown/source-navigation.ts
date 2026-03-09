export type SourceLineCandidate = {
  element: HTMLElement;
  line: number;
};

function parseSourceLine(value: string | undefined) {
  const line = Number(value);
  return Number.isFinite(line) ? line : null;
}

export function collectSourceLineCandidates(root: ParentNode = document) {
  const candidates: SourceLineCandidate[] = [];
  const seenLines = new Set<number>();

  for (const element of Array.from(
    root.querySelectorAll<HTMLElement>("[data-source-line]"),
  )) {
    const line = parseSourceLine(element.dataset.sourceLine);
    if (line === null || seenLines.has(line)) {
      continue;
    }

    seenLines.add(line);
    candidates.push({ element, line });
  }

  return candidates;
}

export function findSourceLineRestoreTarget(
  candidates: SourceLineCandidate[],
  requestedLine: number,
) {
  return (
    candidates.find((candidate) => candidate.line >= requestedLine) ??
    candidates[candidates.length - 1] ??
    null
  );
}

export function findVisibleSourceLine(
  candidates: SourceLineCandidate[],
  viewport: {
    top: number;
    bottom: number;
  },
) {
  if (!candidates.length) {
    return null;
  }

  const viewportCenter = (viewport.top + viewport.bottom) / 2;
  let bestCandidate: SourceLineCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const rect = candidate.element.getBoundingClientRect();
    const nearestPoint =
      viewportCenter < rect.top
        ? rect.top
        : viewportCenter > rect.bottom
          ? rect.bottom
          : viewportCenter;
    const distance = Math.abs(nearestPoint - viewportCenter);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}
