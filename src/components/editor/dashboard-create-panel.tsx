"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { defaultNoteTypography } from "@/lib/book-typography";
import type { GeneralSettings } from "@/lib/content/schemas";

type DashboardCreatePanelProps = {
  kind: "book" | "note";
  generalSettings?: GeneralSettings;
};

export function DashboardCreatePanel({
  kind,
  generalSettings,
}: DashboardCreatePanelProps) {
  const router = useRouter();
  const [title, setTitle] = useState(kind === "book" ? "New book" : "New note");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const create = () => {
    startTransition(async () => {
      setErrorMessage(null);

      try {
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
                }
              : {
                  title,
                  slug: title,
                  summary: "A fresh standalone note.",
                  body: "# New note\n\nStart writing here.",
                  status: "draft",
                  typography: defaultNoteTypography,
                },
          ),
        });

        const payload = (await response.json().catch(() => null)) as
          | { meta?: { slug: string }; error?: string }
          | null;
        const fallbackMessage =
          kind === "book" ? "Could not create book." : "Could not create note.";

        if (!response.ok) {
          setErrorMessage(payload?.error ?? fallbackMessage);
          return;
        }

        if (!payload?.meta?.slug) {
          setErrorMessage(fallbackMessage);
          return;
        }

        router.push(
          kind === "book"
            ? `/app/books/${payload.meta.slug}`
            : `/app/notes/${payload.meta.slug}`,
        );
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : kind === "book"
              ? "Could not create book."
              : "Could not create note.",
        );
      }
    });
  };

  return (
    <div
      className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-5"
      style={{ borderRadius: `${generalSettings?.cornerRadius ?? 28}px` }}
    >
      <p className="paper-label">{kind === "book" ? "Create book" : "Create note"}</p>
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
