"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DashboardActions() {
  const router = useRouter();
  const [noteTitle, setNoteTitle] = useState("New note");
  const [bookTitle, setBookTitle] = useState("New book");
  const [notePending, startNote] = useTransition();
  const [bookPending, startBook] = useTransition();

  const createNote = () => {
    startNote(async () => {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: noteTitle,
          slug: noteTitle,
          summary: "A fresh standalone note.",
          body: "# New note\n\nStart writing here.",
          status: "draft",
          visibility: "private",
          allowExecution: true,
        }),
      });
      const payload = (await response.json()) as { meta?: { slug: string } };
      if (response.ok && payload.meta?.slug) {
        router.push(`/app/notes/${payload.meta.slug}`);
        router.refresh();
      }
    });
  };

  const createBook = () => {
    startBook(async () => {
      const response = await fetch("/api/books", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: bookTitle,
          slug: bookTitle,
          description: "A fresh WebBook.",
          body: "# New book\n\nOutline the idea here.",
          status: "draft",
          visibility: "private",
          theme: "paper",
        }),
      });
      const payload = (await response.json()) as { meta?: { slug: string } };
      if (response.ok && payload.meta?.slug) {
        router.push(`/app/books/${payload.meta.slug}`);
        router.refresh();
      }
    });
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-5">
        <p className="paper-label">Create note</p>
        <div className="grid gap-3">
          <input
            className="paper-input"
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
          />
          <button type="button" className="paper-button" onClick={createNote} disabled={notePending}>
            {notePending ? "Creating..." : "Create note"}
          </button>
        </div>
      </div>

      <div className="rounded-[26px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.56)] p-5">
        <p className="paper-label">Create book</p>
        <div className="grid gap-3">
          <input
            className="paper-input"
            value={bookTitle}
            onChange={(event) => setBookTitle(event.target.value)}
          />
          <button type="button" className="paper-button" onClick={createBook} disabled={bookPending}>
            {bookPending ? "Creating..." : "Create book"}
          </button>
        </div>
      </div>
    </div>
  );
}
