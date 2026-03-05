"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CreateChapterPanel({
  bookSlug,
  rootNextOrder,
  currentChapterPath = [],
  subchapterNextOrder,
}: {
  bookSlug: string;
  rootNextOrder: number;
  currentChapterPath?: string[];
  subchapterNextOrder?: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("New chapter");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<"root" | "sub" | null>(null);
  const canCreateSubchapter =
    currentChapterPath.length > 0 && typeof subchapterNextOrder === "number";

  const createChapter = (target: "root" | "sub") => {
    if (target === "sub" && !canCreateSubchapter) {
      return;
    }
    const parentChapterPath = target === "root" ? [] : currentChapterPath;
    const order = target === "root" ? rootNextOrder : (subchapterNextOrder ?? 1);

    startTransition(async () => {
      setErrorMessage(null);
      setPendingTarget(target);

      try {
        const response = await fetch(`/api/books/${bookSlug}/chapters`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            slug: title,
            parentChapterPath,
            summary: "A fresh chapter.",
            body: "# New chapter\n\nStart writing here.",
            status: "draft",
            allowExecution: true,
            order,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { meta?: { slug: string }; path?: string[]; error?: string }
          | null;

        if (!response.ok) {
          setErrorMessage(payload?.error ?? "Could not create chapter.");
          return;
        }

        const createdPath =
          payload?.path && payload.path.length
            ? payload.path
            : payload?.meta?.slug
              ? [...parentChapterPath, payload.meta.slug]
              : null;

        if (!createdPath) {
          setErrorMessage("Could not create chapter.");
          return;
        }

        router.push(`/app/books/${bookSlug}/chapters/${createdPath.join("/")}`);
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not create chapter.",
        );
      } finally {
        setPendingTarget(null);
      }
    });
  };

  return (
    <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.62)] p-5">
      <p className="paper-label">Create chapter</p>
      <div className="grid gap-3">
        <input
          className="paper-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        {errorMessage ? (
          <p className="text-sm text-[var(--paper-danger)]" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <button
          type="button"
          className="paper-button"
          onClick={() => createChapter("root")}
          disabled={isPending}
        >
          {isPending && pendingTarget === "root"
            ? "Creating root..."
            : `Create root chapter ${rootNextOrder}`}
        </button>
        <button
          type="button"
          className="paper-button"
          onClick={() => createChapter("sub")}
          disabled={isPending || !canCreateSubchapter}
        >
          {isPending && pendingTarget === "sub"
            ? "Creating subchapter..."
            : `Create subchapter ${subchapterNextOrder ?? "-"}`}
        </button>
      </div>
    </div>
  );
}
