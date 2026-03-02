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
  const [isPending, startTransition] = useTransition();

  const createChapter = () => {
    startTransition(async () => {
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
      const payload = (await response.json()) as { meta?: { slug: string } };
      if (response.ok && payload.meta?.slug) {
        router.push(`/app/books/${bookSlug}/chapters/${payload.meta.slug}`);
        router.refresh();
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
        <button type="button" className="paper-button" onClick={createChapter} disabled={isPending}>
          {isPending ? "Creating..." : `Create chapter ${nextOrder}`}
        </button>
      </div>
    </div>
  );
}
