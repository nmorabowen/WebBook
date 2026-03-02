"use client";

import JSZip from "jszip";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookMarked,
  Copy,
  Download,
  Ellipsis,
  FileText,
  GripVertical,
  Home,
  LoaderCircle,
  PenSquare,
  Trash2,
} from "lucide-react";
import type { ContentTree } from "@/lib/content/schemas";
import { cn } from "@/lib/utils";

type AuthoringSidebarProps = {
  tree: ContentTree;
  currentPath?: string;
};

type DropIndicator = {
  bookSlug: string;
  chapterSlug: string;
  position: "before" | "after";
};

type MenuKind = "book" | "chapter" | "note";

type DownloadableBook = {
  meta: { slug: string };
  raw: string;
  chapters: Array<{
    meta: { slug: string; order: number };
    raw: string;
  }>;
};

type DownloadableNote = {
  meta: { slug: string };
  raw: string;
};

type DownloadableChapter = {
  meta: { slug: string };
  raw: string;
};

function applyChapterOrder(
  tree: ContentTree,
  bookSlug: string,
  chapterSlugs: string[],
): ContentTree {
  return {
    ...tree,
    books: tree.books.map((book) => {
      if (book.meta.slug !== bookSlug) {
        return book;
      }

      const chapterMap = new Map(
        book.chapters.map((chapter) => [chapter.meta.slug, chapter] as const),
      );

      return {
        ...book,
        chapters: chapterSlugs.map((slug, index) => {
          const chapter = chapterMap.get(slug);
          if (!chapter) {
            throw new Error(`Missing chapter ${slug}`);
          }

          return {
            ...chapter,
            meta: {
              ...chapter.meta,
              order: index + 1,
            },
          };
        }),
      };
    }),
  };
}

function getReorderedChapterSlugs(
  chapters: Array<{ meta: { slug: string } }>,
  draggedSlug: string,
  targetSlug: string,
  position: "before" | "after",
) {
  const nextChapterSlugs = chapters.map((chapter) => chapter.meta.slug);
  const fromIndex = nextChapterSlugs.indexOf(draggedSlug);
  const targetIndex = nextChapterSlugs.indexOf(targetSlug);

  if (fromIndex < 0 || targetIndex < 0) {
    return null;
  }

  let nextIndex = position === "after" ? targetIndex + 1 : targetIndex;
  if (fromIndex < nextIndex) {
    nextIndex -= 1;
  }

  if (fromIndex === nextIndex) {
    return null;
  }

  const [movedSlug] = nextChapterSlugs.splice(fromIndex, 1);
  nextChapterSlugs.splice(nextIndex, 0, movedSlug);
  return nextChapterSlugs;
}

function NavLink({
  href,
  label,
  active,
  chapter = false,
  dragHandle,
  dragging = false,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  trailingAction,
}: {
  href: string;
  label: string;
  active: boolean;
  chapter?: boolean;
  dragHandle?: React.ReactNode;
  dragging?: boolean;
  dropIndicator?: "before" | "after" | null;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  trailingAction?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        chapter && "ml-4",
        dropIndicator === "before" &&
          "rounded-[20px] ring-2 ring-[var(--paper-accent)] ring-offset-2 ring-offset-transparent",
        dropIndicator === "after" &&
          "rounded-[20px] shadow-[0_2px_0_0_var(--paper-accent)]",
      )}
      draggable={chapter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2">
        <Link
          href={href}
          className={cn(
            "paper-nav-link min-w-0 flex-1",
            active && "paper-nav-link-active",
            chapter && "pl-3 text-[0.97rem]",
            dragging && "opacity-55",
          )}
        >
          <span className="flex items-start gap-2">
            {dragHandle}
            <span>{label}</span>
          </span>
        </Link>
        {trailingAction}
      </div>
    </div>
  );
}

function ActionMenu({
  open,
  busy,
  onToggle,
  onDuplicate,
  onDelete,
  onDownload,
}: {
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="paper-button paper-button-secondary px-3 py-2"
        onClick={onToggle}
        disabled={busy}
        aria-label="Open actions"
      >
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Ellipsis className="h-4 w-4" />}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 grid min-w-[160px] gap-1 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.98)] p-2 shadow-[0_18px_45px_rgba(47,34,21,0.16)]">
          <button type="button" className="sidebar-menu-item" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
          <button type="button" className="sidebar-menu-item" onClick={onDownload}>
            <Download className="h-4 w-4" />
            Download
          </button>
          <button
            type="button"
            className="sidebar-menu-item text-[var(--paper-danger)]"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AuthoringSidebar({
  tree,
  currentPath,
}: AuthoringSidebarProps) {
  const router = useRouter();
  const [localTree, setLocalTree] = useState(tree);
  const [draggedChapter, setDraggedChapter] = useState<{
    bookSlug: string;
    chapterSlug: string;
  } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [pendingBookSlug, setPendingBookSlug] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLocalTree(tree);
  }, [tree]);

  const triggerDownload = (fileName: string, blob: Blob) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const downloadItem = async (kind: MenuKind, slug: string) => {
    const actionId = `${kind}:${slug}:download`;
    setPendingActionId(actionId);
    setOpenMenuId(null);

    try {
      if (kind === "chapter") {
        const [bookSlug, chapterSlug] = slug.split("/");
        const response = await fetch(`/api/books/${bookSlug}/chapters/${chapterSlug}`);
        if (!response.ok) {
          throw new Error("Unable to load chapter for download");
        }

        const payload = (await response.json()) as DownloadableChapter;
        triggerDownload(
          `${payload.meta.slug}.md`,
          new Blob([payload.raw], { type: "text/markdown;charset=utf-8" }),
        );
        return;
      }

      if (kind === "note") {
        const response = await fetch(`/api/notes/${slug}`);
        if (!response.ok) {
          throw new Error("Unable to load note for download");
        }

        const payload = (await response.json()) as DownloadableNote;
        triggerDownload(
          `${payload.meta.slug}.md`,
          new Blob([payload.raw], { type: "text/markdown;charset=utf-8" }),
        );
        return;
      }

      const response = await fetch(`/api/books/${slug}`);
      if (!response.ok) {
        throw new Error("Unable to load book for download");
      }

      const payload = (await response.json()) as DownloadableBook;
      const zip = new JSZip();
      const root = zip.folder(payload.meta.slug);
      root?.file("book.md", payload.raw);
      const chaptersFolder = root?.folder("chapters");

      for (const chapter of payload.chapters) {
        chaptersFolder?.file(
          `${String(chapter.meta.order).padStart(3, "0")}-${chapter.meta.slug}.md`,
          chapter.raw,
        );
      }

      const content = await zip.generateAsync({ type: "blob" });
      triggerDownload(`${payload.meta.slug}.zip`, content);
    } finally {
      setPendingActionId(null);
    }
  };

  const runItemAction = (
    kind: MenuKind,
    slug: string,
    action: "duplicate" | "delete" | "download",
  ) => {
    const actionId = `${kind}:${slug}:${action}`;
    if (action === "download") {
      void downloadItem(kind, slug);
      return;
    }

    setOpenMenuId(null);

    if (action === "delete") {
      const confirmed = window.confirm(
        `Delete this ${kind} from the workspace? This removes the current file(s) from content.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setPendingActionId(actionId);

    startTransition(async () => {
      try {
        const endpoint =
          kind === "book"
            ? `/api/books/${slug}${action === "duplicate" ? "/duplicate" : ""}`
            : kind === "note"
              ? `/api/notes/${slug}${action === "duplicate" ? "/duplicate" : ""}`
              : `/api/books/${slug.split("/")[0]}/chapters/${slug.split("/")[1]}${action === "duplicate" ? "/duplicate" : ""}`;
        const response = await fetch(endpoint, {
          method: action === "duplicate" ? "POST" : "DELETE",
        });

        if (!response.ok) {
          throw new Error(`${action} failed`);
        }

        if (action === "duplicate") {
          const payload = (await response.json()) as {
            meta?: { slug: string; bookSlug?: string };
          };
          if (payload.meta?.slug) {
            router.push(
              kind === "book"
                ? `/app/books/${payload.meta.slug}`
                : kind === "note"
                  ? `/app/notes/${payload.meta.slug}`
                  : `/app/books/${payload.meta.bookSlug}/chapters/${payload.meta.slug}`,
            );
          }
        } else {
          setLocalTree((previousTree) => ({
            books:
              kind === "book"
                ? previousTree.books.filter((book) => book.meta.slug !== slug)
                : kind === "chapter"
                  ? previousTree.books.map((book) => {
                      const [bookSlug, chapterSlug] = slug.split("/");
                      if (book.meta.slug !== bookSlug) {
                        return book;
                      }

                      const nextChapters = book.chapters
                        .filter((chapter) => chapter.meta.slug !== chapterSlug)
                        .map((chapter, index) => ({
                          ...chapter,
                          meta: {
                            ...chapter.meta,
                            order: index + 1,
                          },
                        }));

                      return {
                        ...book,
                        chapters: nextChapters,
                      };
                    })
                : previousTree.books,
            notes:
              kind === "note"
                ? previousTree.notes.filter((note) => note.meta.slug !== slug)
                : previousTree.notes,
          }));

          if (
            (kind === "book" && currentPath?.startsWith(`/app/books/${slug}`)) ||
            (kind === "note" && currentPath === `/app/notes/${slug}`) ||
            (kind === "chapter" &&
              currentPath ===
                `/app/books/${slug.split("/")[0]}/chapters/${slug.split("/")[1]}`)
          ) {
            router.push(
              kind === "chapter" ? `/app/books/${slug.split("/")[0]}` : "/app",
            );
          }
        }

        router.refresh();
      } finally {
        setPendingActionId(null);
      }
    });
  };

  const handleDrop = (
    bookSlug: string,
    targetSlug: string,
    position: "before" | "after",
  ) => {
    if (!draggedChapter || draggedChapter.bookSlug !== bookSlug) {
      setDropIndicator(null);
      return;
    }

    const book = localTree.books.find((entry) => entry.meta.slug === bookSlug);
    if (!book) {
      setDropIndicator(null);
      return;
    }

    const nextChapterSlugs = getReorderedChapterSlugs(
      book.chapters,
      draggedChapter.chapterSlug,
      targetSlug,
      position,
    );

    setDropIndicator(null);
    setDraggedChapter(null);

    if (!nextChapterSlugs) {
      return;
    }

    const previousTree = localTree;
    const nextTree = applyChapterOrder(localTree, bookSlug, nextChapterSlugs);
    setLocalTree(nextTree);
    setPendingBookSlug(bookSlug);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/books/${bookSlug}/chapters/reorder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chapterSlugs: nextChapterSlugs }),
        });

        if (!response.ok) {
          throw new Error("Chapter reorder failed");
        }

        router.refresh();
      } catch {
        setLocalTree(previousTree);
      } finally {
        setPendingBookSlug(null);
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--paper-muted)]">
            WebBook
          </p>
          <h1 className="mt-2 font-serif text-3xl leading-none">Authoring desk</h1>
        </div>
        <Link href="/" className="paper-button paper-button-secondary p-3">
          <Home className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-2">
        <NavLink href="/app" label="Dashboard" active={currentPath === "/app"} />
      </div>

      <section className="grid gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
          <BookMarked className="h-4 w-4" />
          Books
        </div>
        <div className="grid gap-2">
          {localTree.books.map((book) => (
            <div key={book.meta.slug} className="grid gap-1">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <NavLink
                    href={`/app/books/${book.meta.slug}`}
                    label={book.meta.title}
                    active={currentPath === `/app/books/${book.meta.slug}`}
                  />
                </div>
                <ActionMenu
                  open={openMenuId === `book:${book.meta.slug}`}
                  busy={pendingActionId?.startsWith(`book:${book.meta.slug}:`) ?? false}
                  onToggle={() =>
                    setOpenMenuId((current) =>
                      current === `book:${book.meta.slug}` ? null : `book:${book.meta.slug}`,
                    )
                  }
                  onDuplicate={() => runItemAction("book", book.meta.slug, "duplicate")}
                  onDelete={() => runItemAction("book", book.meta.slug, "delete")}
                  onDownload={() => runItemAction("book", book.meta.slug, "download")}
                />
                {pendingBookSlug === book.meta.slug ? (
                  <span className="paper-badge shrink-0 px-2.5 py-1">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  </span>
                ) : null}
              </div>

              <div className="grid gap-1 border-l border-[rgba(73,57,38,0.12)] pl-1">
                {book.chapters.map((chapter) => {
                  const chapterPath = `/app/books/${book.meta.slug}/chapters/${chapter.meta.slug}`;
                  const chapterActionSlug = `${book.meta.slug}/${chapter.meta.slug}`;
                  const indicator =
                    dropIndicator?.bookSlug === book.meta.slug &&
                    dropIndicator.chapterSlug === chapter.meta.slug
                      ? dropIndicator.position
                      : null;

                  return (
                    <NavLink
                      key={`${book.meta.slug}/${chapter.meta.slug}`}
                      href={chapterPath}
                      label={`Chapter ${chapter.meta.order}: ${chapter.meta.title}`}
                      active={currentPath === chapterPath}
                      chapter
                      dragging={
                        draggedChapter?.bookSlug === book.meta.slug &&
                        draggedChapter.chapterSlug === chapter.meta.slug
                      }
                      dropIndicator={indicator}
                      dragHandle={
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--paper-muted)]" />
                      }
                      trailingAction={
                        <ActionMenu
                          open={openMenuId === `chapter:${chapterActionSlug}`}
                          busy={
                            pendingActionId?.startsWith(
                              `chapter:${chapterActionSlug}:`,
                            ) ?? false
                          }
                          onToggle={() =>
                            setOpenMenuId((current) =>
                              current === `chapter:${chapterActionSlug}`
                                ? null
                                : `chapter:${chapterActionSlug}`,
                            )
                          }
                          onDuplicate={() =>
                            runItemAction("chapter", chapterActionSlug, "duplicate")
                          }
                          onDelete={() =>
                            runItemAction("chapter", chapterActionSlug, "delete")
                          }
                          onDownload={() =>
                            runItemAction("chapter", chapterActionSlug, "download")
                          }
                        />
                      }
                      onDragStart={(event) => {
                        setDraggedChapter({
                          bookSlug: book.meta.slug,
                          chapterSlug: chapter.meta.slug,
                        });
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          `${book.meta.slug}:${chapter.meta.slug}`,
                        );
                      }}
                      onDragEnd={() => {
                        setDraggedChapter(null);
                        setDropIndicator(null);
                      }}
                      onDragOver={(event) => {
                        if (
                          !draggedChapter ||
                          draggedChapter.bookSlug !== book.meta.slug ||
                          draggedChapter.chapterSlug === chapter.meta.slug
                        ) {
                          return;
                        }

                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const position =
                          event.clientY - bounds.top > bounds.height / 2
                            ? "after"
                            : "before";

                        setDropIndicator({
                          bookSlug: book.meta.slug,
                          chapterSlug: chapter.meta.slug,
                          position,
                        });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleDrop(
                          book.meta.slug,
                          chapter.meta.slug,
                          dropIndicator?.bookSlug === book.meta.slug &&
                            dropIndicator.chapterSlug === chapter.meta.slug
                            ? dropIndicator.position
                            : "before",
                        );
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
          <FileText className="h-4 w-4" />
          Notes
        </div>
        <div className="grid gap-2">
          {localTree.notes.map((note) => (
            <div key={note.meta.slug} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <NavLink
                  href={`/app/notes/${note.meta.slug}`}
                  label={note.meta.title}
                  active={currentPath === `/app/notes/${note.meta.slug}`}
                />
              </div>
              <ActionMenu
                open={openMenuId === `note:${note.meta.slug}`}
                busy={pendingActionId?.startsWith(`note:${note.meta.slug}:`) ?? false}
                onToggle={() =>
                  setOpenMenuId((current) =>
                    current === `note:${note.meta.slug}` ? null : `note:${note.meta.slug}`,
                  )
                }
                onDuplicate={() => runItemAction("note", note.meta.slug, "duplicate")}
                onDelete={() => runItemAction("note", note.meta.slug, "delete")}
                onDownload={() => runItemAction("note", note.meta.slug, "download")}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="mt-auto rounded-[24px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.55)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PenSquare className="h-4 w-4 text-[var(--paper-accent)]" />
          Markdown-first
        </div>
        <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
          Write directly in markdown, preview MathJax live, and publish without switching tools.
        </p>
      </div>
    </>
  );
}
