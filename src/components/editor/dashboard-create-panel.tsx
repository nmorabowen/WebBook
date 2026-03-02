"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DashboardCreatePanelProps = {
  kind: "book" | "note";
};

export function DashboardCreatePanel({ kind }: DashboardCreatePanelProps) {
  const router = useRouter();
  const [title, setTitle] = useState(kind === "book" ? "New book" : "New note");
  const [isPending, startTransition] = useTransition();

  const create = () => {
    startTransition(async () => {
      const response = await fetch(kind === "book" ? "/api/books" : "/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          kind === "book"
            ? {
                title,
                slug: title,
                description: "A fresh WebBook.",
                body: "# New book\n\nOutline the idea here.",
                status: "draft",
                visibility: "private",
                theme: "paper",
              }
            : {
                title,
                slug: title,
                summary: "A fresh standalone note.",
                body: "# New note\n\nStart writing here.",
                status: "draft",
                visibility: "private",
                allowExecution: true,
              },
        ),
      });

      const payload = (await response.json()) as { meta?: { slug: string } };
      if (!response.ok || !payload.meta?.slug) {
        return;
      }

      router.push(
        kind === "book"
          ? `/app/books/${payload.meta.slug}`
          : `/app/notes/${payload.meta.slug}`,
      );
      router.refresh();
    });
  };

  return (
    <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-5">
      <p className="paper-label">{kind === "book" ? "Create book" : "Create note"}</p>
      <div className="grid gap-3">
        <input
          className="paper-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="button" className="paper-button" onClick={create} disabled={isPending}>
          {isPending
            ? "Creating..."
            : kind === "book"
              ? "Create book"
              : "Create note"}
        </button>
      </div>
    </div>
  );
}
