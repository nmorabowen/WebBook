import { describe, expect, it } from "vitest";
import {
  findSourceLineRestoreTarget,
  findVisibleSourceLine,
  type SourceLineCandidate,
} from "@/components/markdown/source-navigation";

function createCandidate(line: number, top: number, bottom: number): SourceLineCandidate {
  return {
    line,
    element: {
      getBoundingClientRect: () => ({ top, bottom }) as DOMRect,
    } as HTMLElement,
  };
}

describe("source navigation helpers", () => {
  it("restores to the first candidate at or after the requested line", () => {
    const candidates = [
      createCandidate(1, 0, 40),
      createCandidate(3, 50, 90),
      createCandidate(7, 100, 140),
    ];

    expect(findSourceLineRestoreTarget(candidates, 4)?.line).toBe(7);
  });

  it("falls back to the last candidate when the requested line is beyond the content", () => {
    const candidates = [
      createCandidate(1, 0, 40),
      createCandidate(3, 50, 90),
      createCandidate(7, 100, 140),
    ];

    expect(findSourceLineRestoreTarget(candidates, 99)?.line).toBe(7);
  });

  it("picks the candidate nearest the viewport center for visible-line tracking", () => {
    const candidates = [
      createCandidate(1, 0, 80),
      createCandidate(5, 220, 320),
      createCandidate(8, 420, 520),
    ];

    expect(findVisibleSourceLine(candidates, { top: 0, bottom: 600 })?.line).toBe(5);
  });
});
