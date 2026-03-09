/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { ReadingMetaPanel } from "@/components/reading-meta-panel";

describe("ReadingMetaPanel", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }

    if (container) {
      document.body.removeChild(container);
      container = null;
    }

    document.body.innerHTML = "";
  });

  it("renders only backlinks with valid routes", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ReadingMetaPanel
          backlinks={[
            {
              id: "valid-note",
              kind: "note",
              slug: "valid-note",
              title: "Valid note",
              route: "/notes/valid-note",
              status: "published",
            },
            {
              id: "missing-route",
              kind: "note",
              slug: "missing-route",
              title: "Broken note",
              route: "",
              status: "published",
            },
          ]}
          updatedAt="2026-03-09T00:00:00.000Z"
        />,
      );
    });

    const links = Array.from(container.querySelectorAll("a"));
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/notes/valid-note");
    expect(container.textContent).not.toContain("Broken note");
  });
});
