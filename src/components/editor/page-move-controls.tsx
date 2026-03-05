"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, MoveRight } from "lucide-react";
import { ChapterMoveDialog } from "@/components/chapter-move-dialog";
import type { ChapterTreeNode } from "@/lib/content/schemas";

function moveSlugByStep(slugs: string[], slug: string, direction: "up" | "down") {
  const index = slugs.indexOf(slug);
  if (index < 0) {
    return null;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= slugs.length) {
    return null;
  }

  const next = [...slugs];
  const [entry] = next.splice(index, 1);
  next.splice(targetIndex, 0, entry);
  return next;
}

type BookMoveControls = {
  mode: "book";
  slug: string;
  orderedSlugs: string[];
};

type NoteMoveControls = {
  mode: "note";
  slug: string;
  orderedSlugs: string[];
};

type ChapterMoveControls = {
  mode: "chapter";
  bookSlug: string;
  chapterPath: string[];
  chapterTitle: string;
  bookChapters: ChapterTreeNode[];
};

type PageMoveControlsProps = BookMoveControls | NoteMoveControls | ChapterMoveControls;

export function PageMoveControls(props: PageMoveControlsProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"up" | "down" | "move" | null>(null);
  const [, startTransition] = useTransition();

  if (props.mode === "chapter") {
    return (
      <>
        <div className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.5)] p-3">
          <p className="paper-label">Move/Reorder</p>
          <button
            type="button"
            className="paper-button mt-2 inline-flex items-center gap-2"
            onClick={() => {
              setErrorMessage(null);
              setIsMoveDialogOpen(true);
            }}
            disabled={pendingAction !== null}
          >
            <MoveRight className="h-4 w-4" />
            Move chapter
          </button>
          {errorMessage ? (
            <p className="mt-2 text-sm text-[var(--paper-danger)]" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
        {isMoveDialogOpen ? (
          <ChapterMoveDialog
            chapterTitle={props.chapterTitle}
            chapterPath={props.chapterPath}
            bookChapters={props.bookChapters}
            initialParentPath={props.chapterPath.slice(0, -1)}
            busy={pendingAction === "move"}
            onClose={() => setIsMoveDialogOpen(false)}
            onSubmit={(input) => {
              setPendingAction("move");
              setErrorMessage(null);
              startTransition(async () => {
                try {
                  const response = await fetch(
                    `/api/books/${props.bookSlug}/chapters/move`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        chapterPath: props.chapterPath,
                        parentChapterPath: input.parentChapterPath,
                        order: input.order,
                      }),
                    },
                  );
                  const payload = (await response.json().catch(() => null)) as
                    | { error?: string; path?: string[] }
                    | null;
                  if (!response.ok) {
                    throw new Error(payload?.error ?? "Unable to move this chapter.");
                  }

                  setIsMoveDialogOpen(false);
                  if (payload?.path?.length) {
                    router.push(`/app/books/${props.bookSlug}/chapters/${payload.path.join("/")}`);
                  }
                  router.refresh();
                } catch (error) {
                  setErrorMessage(
                    error instanceof Error ? error.message : "Unable to move this chapter.",
                  );
                } finally {
                  setPendingAction(null);
                }
              });
            }}
          />
        ) : null}
      </>
    );
  }

  const currentIndex = props.orderedSlugs.indexOf(props.slug);
  const canMoveUp = currentIndex > 0;
  const canMoveDown = currentIndex >= 0 && currentIndex < props.orderedSlugs.length - 1;

  const reorder = (direction: "up" | "down") => {
    const nextSlugs = moveSlugByStep(props.orderedSlugs, props.slug, direction);
    if (!nextSlugs) {
      return;
    }

    setPendingAction(direction);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(
          props.mode === "book" ? "/api/books/reorder" : "/api/notes/reorder",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              props.mode === "book"
                ? { bookSlugs: nextSlugs }
                : { noteSlugs: nextSlugs },
            ),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? `Unable to reorder this ${props.mode}.`);
        }
        router.refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : `Unable to reorder this ${props.mode}.`,
        );
      } finally {
        setPendingAction(null);
      }
    });
  };

  return (
    <div className="rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.5)] p-3">
      <p className="paper-label">Move/Reorder</p>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="paper-button paper-button-secondary inline-flex items-center gap-2"
          onClick={() => reorder("up")}
          disabled={!canMoveUp || pendingAction !== null}
        >
          <ArrowUp className="h-4 w-4" />
          Move up
        </button>
        <button
          type="button"
          className="paper-button paper-button-secondary inline-flex items-center gap-2"
          onClick={() => reorder("down")}
          disabled={!canMoveDown || pendingAction !== null}
        >
          <ArrowDown className="h-4 w-4" />
          Move down
        </button>
      </div>
      {errorMessage ? (
        <p className="mt-2 text-sm text-[var(--paper-danger)]" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
