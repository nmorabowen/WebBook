"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CreateChapterPanel({
  bookSlug,
  nextOrder,
}: {
  bookSlug: string;
  nextOrder: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("New chapter");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const createChapter = () => {
    startTransition(async () => {
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/books/${bookSlug}/chapters`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            slug: title,
            summary: "A fresh chapter.",
            body: "# New chapter\n\nStart writing here.",
            status: "draft",
            allowExecution: true,
            order: nextOrder,
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { meta?: { slug: string }; error?: string }
          | null;

        if (!response.ok) {
          setErrorMessage(payload?.error ?? "Could not create chapter.");
          return;
        }

        if (!payload?.meta?.slug) {
          setErrorMessage("Could not create chapter.");
          return;
        }

        router.push(`/app/books/${bookSlug}/chapters/${payload.meta.slug}`);
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not create chapter.",
        );
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
        <button type="button" className="paper-button" onClick={createChapter} disabled={isPending}>
          {isPending ? "Creating..." : `Create chapter ${nextOrder}`}
        </button>
      </div>
    </div>
  );
}
