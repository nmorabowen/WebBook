"use client";

import JSZip from "jszip";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookMarked,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Ellipsis,
  FileText,
  Home,
  LoaderCircle,
  MoveRight,
  PenSquare,
  Trash2,
} from "lucide-react";
import { ChapterMoveDialog } from "@/components/chapter-move-dialog";
import type { SessionPayload } from "@/lib/auth";
import { ContentSearchLauncher } from "@/components/content-search-launcher";
import type {
  ChapterTreeNode,
  ContentTree,
  GeneralSettings,
} from "@/lib/content/schemas";
import { cn } from "@/lib/utils";

type AuthoringSidebarProps = {
  tree: ContentTree;
  currentPath?: string;
  generalSettings?: GeneralSettings;
  session?: SessionPayload | null;
};

type MenuKind = "book" | "chapter" | "note";

type DownloadableBook = {
  meta: { slug: string };
  raw: string;
  chapters: Array<{
    meta: { slug: string; order: number };
    raw: string;
    children: DownloadableBook["chapters"];
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

const COLLAPSED_BOOKS_STORAGE_KEY = "webbook.authoring-sidebar.collapsed-books";
const COLLAPSED_CHAPTERS_STORAGE_KEY = "webbook.authoring-sidebar.collapsed-chapters";
const CHAPTER_ACTION_SEPARATOR = "::";

function chapterPathKey(bookSlug: string, chapterPath: string[]) {
  return `${bookSlug}/${chapterPath.join("/")}`;
}

function encodeChapterActionSlug(bookSlug: string, chapterPath: string[]) {
  return `${bookSlug}${CHAPTER_ACTION_SEPARATOR}${chapterPath.join("/")}`;
}

function decodeChapterActionSlug(encoded: string) {
  const [bookSlug, chapterPathRaw = ""] = encoded.split(CHAPTER_ACTION_SEPARATOR);
  return {
    bookSlug,
    chapterPath: chapterPathRaw.split("/").filter(Boolean),
  };
}

function findChapterNode(chapters: ChapterTreeNode[], chapterPath: string[]): ChapterTreeNode | null {
  if (!chapterPath.length) {
    return null;
  }

  const [head, ...tail] = chapterPath;
  const chapter = chapters.find((entry) => entry.meta.slug === head);
  if (!chapter) {
    return null;
  }
  if (!tail.length) {
    return chapter;
  }
  return findChapterNode(chapter.children, tail);
}

function findChapterSiblings(
  chapters: ChapterTreeNode[],
  parentPath: string[],
): ChapterTreeNode[] | null {
  if (!parentPath.length) {
    return chapters;
  }

  const [head, ...tail] = parentPath;
  const parent = chapters.find((entry) => entry.meta.slug === head);
  if (!parent) {
    return null;
  }

  return findChapterSiblings(parent.children, tail);
}

function defaultCollapsedBooks(
  tree: ContentTree,
  currentPath?: string,
  generalSettings?: GeneralSettings,
) {
  const activeBookSlug = currentPath?.startsWith("/app/books/")
    ? currentPath.split("/")[3]
    : null;
  const collapseByDefault = generalSettings?.collapseBookChaptersByDefault ?? true;

  return Object.fromEntries(
    tree.books.map((book) => [
      book.meta.slug,
      book.meta.slug === activeBookSlug ? false : collapseByDefault,
    ]),
  ) as Record<string, boolean>;
}

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

function applyBookOrder(tree: ContentTree, orderedSlugs: string[]): ContentTree {
  const bookMap = new Map(tree.books.map((book) => [book.meta.slug, book] as const));
  return {
    ...tree,
    books: orderedSlugs.map((slug, index) => {
      const book = bookMap.get(slug);
      if (!book) {
        throw new Error(`Missing book ${slug}`);
      }
      return {
        ...book,
        meta: {
          ...book.meta,
          order: index + 1,
        },
      };
    }),
  };
}

function applyNoteOrder(tree: ContentTree, orderedSlugs: string[]): ContentTree {
  const noteMap = new Map(tree.notes.map((note) => [note.meta.slug, note] as const));
  return {
    ...tree,
    notes: orderedSlugs.map((slug, index) => {
      const note = noteMap.get(slug);
      if (!note) {
        throw new Error(`Missing note ${slug}`);
      }
      return {
        ...note,
        meta: {
          ...note.meta,
          order: index + 1,
        },
      };
    }),
  };
}

function NavLink({
  href,
  label,
  active,
  chapter = false,
  trailingAction,
}: {
  href: string;
  label: string;
  active: boolean;
  chapter?: boolean;
  trailingAction?: React.ReactNode;
}) {
  return (
    <div className={cn(chapter && "ml-4")}>
      <div className="flex items-center gap-2">
        <Link
          href={href}
          className={cn(
            "paper-nav-link min-w-0 flex-1",
            active && "paper-nav-link-active",
            chapter && "pl-3 text-[0.97rem]",
          )}
        >
          <span>{label}</span>
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
  onMove,
  onMoveUp,
  onMoveDown,
  disableMoveUp,
  disableMoveDown,
  onDuplicate,
  onDelete,
  onDownload,
}: {
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onMove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  disableMoveUp?: boolean;
  disableMoveDown?: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="icon-plain-button"
        onClick={onToggle}
        disabled={busy}
        aria-label="Open actions"
      >
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Ellipsis className="h-4 w-4" />}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-2 grid min-w-[160px] gap-1 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.98)] p-2 shadow-[0_18px_45px_rgba(47,34,21,0.16)]">
          {onMove ? (
            <button type="button" className="sidebar-menu-item" onClick={onMove}>
              <MoveRight className="h-4 w-4" />
              Move...
            </button>
          ) : null}
          {onMoveUp ? (
            <button
              type="button"
              className="sidebar-menu-item"
              onClick={onMoveUp}
              disabled={disableMoveUp}
            >
              <ArrowUp className="h-4 w-4" />
              Move up
            </button>
          ) : null}
          {onMoveDown ? (
            <button
              type="button"
              className="sidebar-menu-item"
              onClick={onMoveDown}
              disabled={disableMoveDown}
            >
              <ArrowDown className="h-4 w-4" />
              Move down
            </button>
          ) : null}
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
  generalSettings,
  session,
}: AuthoringSidebarProps) {
  const router = useRouter();
  const [localTree, setLocalTree] = useState(tree);
  const [collapsedBooks, setCollapsedBooks] = useState<Record<string, boolean>>(() =>
    defaultCollapsedBooks(tree, currentPath, generalSettings),
  );
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<{
    bookSlug: string;
    chapterPath: string[];
    chapterTitle: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setLocalTree(tree);
  }, [tree]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_BOOKS_STORAGE_KEY);
      if (!raw) {
        setCollapsedBooks(defaultCollapsedBooks(tree, currentPath, generalSettings));
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setCollapsedBooks({
        ...defaultCollapsedBooks(tree, currentPath, generalSettings),
        ...parsed,
      });
    } catch {}
  }, [tree, currentPath, generalSettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COLLAPSED_BOOKS_STORAGE_KEY,
        JSON.stringify(collapsedBooks),
      );
    } catch {}
  }, [collapsedBooks]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_CHAPTERS_STORAGE_KEY);
      if (!raw) {
        setCollapsedChapters({});
        return;
      }
      setCollapsedChapters(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      setCollapsedChapters({});
    }
  }, [tree]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COLLAPSED_CHAPTERS_STORAGE_KEY,
        JSON.stringify(collapsedChapters),
      );
    } catch {}
  }, [collapsedChapters]);

  useEffect(() => {
    if (!currentPath?.startsWith("/app/books/")) {
      return;
    }

    const pathSegments = currentPath.split("/");
    const activeBookSlug = pathSegments[3];
    if (!activeBookSlug) {
      return;
    }

    setCollapsedBooks((current) => {
      if (!current[activeBookSlug]) {
        return current;
      }

      return {
        ...current,
        [activeBookSlug]: false,
      };
    });

    const chapterPath = pathSegments.slice(5).filter(Boolean);
    if (!chapterPath.length) {
      return;
    }

    setCollapsedChapters((current) => {
      const expanded = { ...current };
      for (let index = 0; index < chapterPath.length - 1; index += 1) {
        const ancestorPath = chapterPath.slice(0, index + 1);
        expanded[chapterPathKey(activeBookSlug, ancestorPath)] = false;
      }
      return expanded;
    });
  }, [currentPath]);

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
        const { bookSlug, chapterPath } = decodeChapterActionSlug(slug);
        const response = await fetch(`/api/books/${bookSlug}/chapters/${chapterPath.join("/")}`);
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
      const appendChapters = (
        chapters: DownloadableBook["chapters"],
        folder: JSZip | null | undefined,
      ) => {
        if (!folder) {
          return;
        }
        for (const chapter of chapters) {
          const stem = `${String(chapter.meta.order).padStart(3, "0")}-${chapter.meta.slug}`;
          folder.file(`${stem}.md`, chapter.raw);
          if (chapter.children.length > 0) {
            appendChapters(chapter.children, folder.folder(stem)?.folder("chapters"));
          }
        }
      };
      appendChapters(payload.chapters, chaptersFolder);

      const content = await zip.generateAsync({ type: "blob" });
      triggerDownload(`${payload.meta.slug}.zip`, content);
    } finally {
      setPendingActionId(null);
    }
  };

  const runItemAction = (
    kind: MenuKind,
    slug: string,
    action: "duplicate" | "delete" | "download" | "move" | "move-up" | "move-down",
  ) => {
    const actionId = `${kind}:${slug}:${action}`;
    if (action === "download") {
      void downloadItem(kind, slug);
      return;
    }

    setOpenMenuId(null);
    setActionError(null);

    if (action === "move") {
      if (kind !== "chapter") {
        return;
      }

      const { bookSlug, chapterPath } = decodeChapterActionSlug(slug);
      const book = localTree.books.find((entry) => entry.meta.slug === bookSlug);
      if (!book) {
        setActionError("Book not found.");
        return;
      }
      const chapter = findChapterNode(book.chapters, chapterPath);
      if (!chapter) {
        setActionError("Chapter not found.");
        return;
      }
      setMoveTarget({
        bookSlug,
        chapterPath,
        chapterTitle: chapter.meta.title,
      });
      return;
    }

    if ((action === "move-up" || action === "move-down") && kind === "chapter") {
      const direction = action === "move-up" ? "up" : "down";
      const { bookSlug, chapterPath } = decodeChapterActionSlug(slug);
      const book = localTree.books.find((entry) => entry.meta.slug === bookSlug);
      if (!book) {
        setActionError("Book not found.");
        return;
      }

      const parentChapterPath = chapterPath.slice(0, -1);
      const siblings = findChapterSiblings(book.chapters, parentChapterPath);
      if (!siblings) {
        setActionError("Chapter parent not found.");
        return;
      }

      const chapterSlug = chapterPath.at(-1);
      if (!chapterSlug) {
        setActionError("Chapter not found.");
        return;
      }

      const currentIndex = siblings.findIndex((chapter) => chapter.meta.slug === chapterSlug);
      if (currentIndex < 0) {
        setActionError("Chapter not found.");
        return;
      }

      const currentChapter = siblings[currentIndex];
      const targetOrder =
        currentChapter.meta.order + (direction === "up" ? -1 : 1);
      if (targetOrder < 1 || targetOrder > siblings.length) {
        return;
      }

      setPendingActionId(actionId);
      setActionError(null);

      startTransition(async () => {
        try {
          const response = await fetch(`/api/books/${bookSlug}/chapters/move`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chapterPath,
              parentChapterPath,
              order: targetOrder,
            }),
          });

          const payload = (await response.json().catch(() => null)) as
            | { error?: string; path?: string[] }
            | null;

          if (!response.ok) {
            throw new Error(payload?.error ?? "Unable to reorder this chapter.");
          }

          if (payload?.path?.length) {
            router.push(`/app/books/${bookSlug}/chapters/${payload.path.join("/")}`);
          }
          router.refresh();
        } catch (error) {
          setActionError(
            error instanceof Error
              ? error.message
              : "Unable to reorder this chapter.",
          );
        } finally {
          setPendingActionId(null);
        }
      });
      return;
    }

    if ((action === "move-up" || action === "move-down") && (kind === "book" || kind === "note")) {
      const direction = action === "move-up" ? "up" : "down";
      const orderedSlugs =
        kind === "book"
          ? localTree.books.map((book) => book.meta.slug)
          : localTree.notes.map((note) => note.meta.slug);
      const nextOrderedSlugs = moveSlugByStep(orderedSlugs, slug, direction);
      if (!nextOrderedSlugs) {
        return;
      }

      const previousTree = localTree;
      setPendingActionId(actionId);
      setActionError(null);
      setLocalTree(
        kind === "book"
          ? applyBookOrder(localTree, nextOrderedSlugs)
          : applyNoteOrder(localTree, nextOrderedSlugs),
      );

      startTransition(async () => {
        try {
          const endpoint = kind === "book" ? "/api/books/reorder" : "/api/notes/reorder";
          const payload =
            kind === "book"
              ? { bookSlugs: nextOrderedSlugs }
              : { noteSlugs: nextOrderedSlugs };
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            throw new Error(body?.error ?? `${kind} reorder failed`);
          }

          router.refresh();
        } catch (error) {
          setLocalTree(previousTree);
          setActionError(
            error instanceof Error ? error.message : `${kind} reorder failed`,
          );
        } finally {
          setPendingActionId(null);
        }
      });
      return;
    }

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
        let navigated = false;
        const endpoint =
          kind === "book"
            ? `/api/books/${slug}${action === "duplicate" ? "/duplicate" : ""}`
            : kind === "note"
              ? `/api/notes/${slug}${action === "duplicate" ? "/duplicate" : ""}`
              : (() => {
                  const { bookSlug, chapterPath } = decodeChapterActionSlug(slug);
                  return action === "duplicate"
                    ? `/api/books/${bookSlug}/chapters/duplicate/${chapterPath.join("/")}`
                    : `/api/books/${bookSlug}/chapters/${chapterPath.join("/")}`;
                })();
        const response = await fetch(endpoint, {
          method: action === "duplicate" ? "POST" : "DELETE",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          setActionError(
            payload?.error ??
              `Unable to ${action} this ${kind}.`,
          );
          return;
        }

        if (action === "duplicate") {
          const payload = (await response.json()) as {
            meta?: { slug: string; bookSlug?: string };
            path?: string[];
          };
          if (payload.meta?.slug) {
            const duplicatedPath =
              payload.path && payload.path.length
                ? payload.path.join("/")
                : payload.meta.slug;
            router.push(
              kind === "book"
                ? `/app/books/${payload.meta.slug}`
                : kind === "note"
                  ? `/app/notes/${payload.meta.slug}`
                  : `/app/books/${payload.meta.bookSlug}/chapters/${duplicatedPath}`,
            );
            navigated = true;
          }
        } else {
          setActionError(null);
          setLocalTree((previousTree) => ({
            books:
              kind === "book"
                ? previousTree.books.filter((book) => book.meta.slug !== slug)
                : previousTree.books,
            notes:
              kind === "note"
                ? previousTree.notes.filter((note) => note.meta.slug !== slug)
                : previousTree.notes,
          }));

          const chapterContext =
            kind === "chapter" ? decodeChapterActionSlug(slug) : null;
          const chapterRoute = chapterContext
            ? `/app/books/${chapterContext.bookSlug}/chapters/${chapterContext.chapterPath.join("/")}`
            : null;

          if (
            (kind === "book" && currentPath?.startsWith(`/app/books/${slug}`)) ||
            (kind === "note" && currentPath === `/app/notes/${slug}`) ||
            (kind === "chapter" && chapterRoute && currentPath === chapterRoute)
          ) {
            router.push(
              kind === "chapter" && chapterContext
                ? `/app/books/${chapterContext.bookSlug}`
                : "/app",
            );
            navigated = true;
          }
        }

        if (!navigated) {
          router.refresh();
        }
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : `Unable to ${action} this ${kind}.`,
        );
      } finally {
        setPendingActionId(null);
      }
    });
  };

  const toggleBookCollapsed = (bookSlug: string) => {
    setCollapsedBooks((current) => ({
      ...current,
      [bookSlug]: !current[bookSlug],
    }));
  };

  const toggleChapterCollapsed = (bookSlug: string, chapterPath: string[]) => {
    const key = chapterPathKey(bookSlug, chapterPath);
    setCollapsedChapters((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const isChapterCollapsed = (bookSlug: string, chapterPath: string[]) =>
    collapsedChapters[chapterPathKey(bookSlug, chapterPath)] ?? false;

  const allBooksCollapsed =
    localTree.books.length > 0 &&
    localTree.books.every((book) => collapsedBooks[book.meta.slug]);

  const toggleAllBooksCollapsed = () => {
    setCollapsedBooks((current) => {
      const nextCollapsed = !localTree.books.every((book) => current[book.meta.slug]);
      return Object.fromEntries(
        localTree.books.map((book) => [book.meta.slug, nextCollapsed]),
      ) as Record<string, boolean>;
    });
  };

  const moveTargetBook = useMemo(
    () =>
      moveTarget
        ? localTree.books.find((book) => book.meta.slug === moveTarget.bookSlug) ?? null
        : null,
    [localTree.books, moveTarget],
  );

  const closeMoveDialog = () => {
    setMoveTarget(null);
  };

  const submitMoveDialog = (input: { parentChapterPath: string[]; order?: number }) => {
    if (!moveTarget || !moveTargetBook) {
      return;
    }

    const chapterActionSlug = encodeChapterActionSlug(
      moveTarget.bookSlug,
      moveTarget.chapterPath,
    );
    const actionId = `chapter:${chapterActionSlug}:move`;

    setPendingActionId(actionId);
    setActionError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/books/${moveTarget.bookSlug}/chapters/move`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chapterPath: moveTarget.chapterPath,
            parentChapterPath: input.parentChapterPath,
            order: input.order,
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: string; path?: string[] }
          | null;

        if (!response.ok) {
          setActionError(payload?.error ?? "Unable to move this chapter.");
          return;
        }

        setActionError(null);
        closeMoveDialog();

        if (payload?.path?.length) {
          router.push(`/app/books/${moveTarget.bookSlug}/chapters/${payload.path.join("/")}`);
        }
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to move this chapter.",
        );
      } finally {
        setPendingActionId(null);
      }
    });
  };

  const renderChapterTree = (bookSlug: string, chapters: ChapterTreeNode[], depth = 0) =>
    chapters.map((chapter, chapterIndex) => {
      const chapterPath = `/app/books/${bookSlug}/chapters/${chapter.path.join("/")}`;
      const chapterActionSlug = encodeChapterActionSlug(bookSlug, chapter.path);
      const collapsed = isChapterCollapsed(bookSlug, chapter.path);
      const disableMoveUp = chapterIndex === 0;
      const disableMoveDown = chapterIndex === chapters.length - 1;

      return (
        <div key={chapterPath} className="grid gap-1">
          <div
            className="flex items-center gap-2"
            style={{ paddingLeft: `${Math.max(depth, 0) * 10}px` }}
          >
            {chapter.children.length ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center rounded-full p-1 text-[var(--paper-muted)] transition hover:text-[var(--paper-ink)]"
                onClick={() => toggleChapterCollapsed(bookSlug, chapter.path)}
                aria-label={
                  collapsed ? `Expand ${chapter.meta.title}` : `Collapse ${chapter.meta.title}`
                }
                aria-expanded={!collapsed}
              >
                {collapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="inline-flex h-6 w-6 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <NavLink
                href={chapterPath}
                label={`Chapter ${chapter.meta.order}: ${chapter.meta.title}`}
                active={currentPath === chapterPath}
                chapter
                trailingAction={
                  <ActionMenu
                    open={openMenuId === `chapter:${chapterActionSlug}`}
                    busy={pendingActionId?.startsWith(`chapter:${chapterActionSlug}:`) ?? false}
                    onToggle={() =>
                      setOpenMenuId((current) =>
                        current === `chapter:${chapterActionSlug}`
                          ? null
                          : `chapter:${chapterActionSlug}`,
                      )
                    }
                    onMove={() =>
                      runItemAction("chapter", chapterActionSlug, "move")
                    }
                    onMoveUp={() =>
                      runItemAction("chapter", chapterActionSlug, "move-up")
                    }
                    onMoveDown={() =>
                      runItemAction("chapter", chapterActionSlug, "move-down")
                    }
                    disableMoveUp={disableMoveUp}
                    disableMoveDown={disableMoveDown}
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
              />
            </div>
          </div>
          {!collapsed && chapter.children.length ? (
            <div className="grid gap-1 border-l border-[rgba(73,57,38,0.12)] pl-1">
              {renderChapterTree(bookSlug, chapter.children, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });

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

      <ContentSearchLauncher
        scope="workspace"
        buttonLabel="Search workspace"
        dialogTitle="Search the workspace"
        dialogDescription="Search books, chapters, notes, and drafts from the indexed authoring workspace."
        buttonClassName="justify-center"
      />

      {actionError ? (
        <div
          className="rounded-[18px] border border-[var(--paper-danger)]/20 bg-[rgba(197,93,53,0.08)] px-4 py-3 text-sm text-[var(--paper-danger)]"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}

      {moveTarget && moveTargetBook ? (
        <ChapterMoveDialog
          chapterTitle={moveTarget.chapterTitle}
          chapterPath={moveTarget.chapterPath}
          bookChapters={moveTargetBook.chapters}
          initialParentPath={moveTarget.chapterPath.slice(0, -1)}
          busy={pendingActionId?.endsWith(":move") ?? false}
          errorMessage={actionError}
          onClose={closeMoveDialog}
          onSubmit={submitMoveDialog}
        />
      ) : null}

      <div className="grid gap-2">
        <NavLink href="/app" label="Dashboard" active={currentPath === "/app"} />

        <div className="grid gap-2">
          {session?.role === "admin" ? (
            <NavLink
              href="/app/settings/general"
              label="General settings"
              active={currentPath?.startsWith("/app/settings/") ?? false}
            />
          ) : (
            <p className="paper-label px-3">General settings</p>
          )}

          <div className="ml-4 grid gap-2">
            {session?.role === "admin" ? (
              <NavLink
                href="/app/settings/errors"
                label="Errors"
                active={currentPath === "/app/settings/errors"}
              />
            ) : null}
            <NavLink
              href="/app/settings/access"
              label="Access"
              active={currentPath === "/app/settings/access"}
            />
            <NavLink
              href="/app/settings/shortcuts"
              label="Shortcuts"
              active={currentPath === "/app/settings/shortcuts"}
            />
            <NavLink
              href="/app/settings/analytics"
              label="Analytics"
              active={currentPath === "/app/settings/analytics"}
            />
          </div>
        </div>
      </div>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-[var(--paper-muted)]">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4" />
            Books
          </div>
          {localTree.books.length ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center p-1 text-[var(--paper-muted)] transition hover:text-[var(--paper-ink)]"
              onClick={toggleAllBooksCollapsed}
              aria-label={allBooksCollapsed ? "Expand all books" : "Collapse all books"}
              aria-expanded={!allBooksCollapsed}
            >
              {allBooksCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          ) : null}
        </div>
        <div className="grid gap-2">
          {localTree.books.map((book, bookIndex) => (
            <div key={book.meta.slug} className="grid gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center rounded-full p-1 text-[var(--paper-muted)] transition hover:text-[var(--paper-ink)]"
                  onClick={() => toggleBookCollapsed(book.meta.slug)}
                  aria-label={
                    collapsedBooks[book.meta.slug]
                      ? `Expand ${book.meta.title}`
                      : `Collapse ${book.meta.title}`
                  }
                  aria-expanded={!collapsedBooks[book.meta.slug]}
                >
                  {collapsedBooks[book.meta.slug] ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
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
                  onMoveUp={() => runItemAction("book", book.meta.slug, "move-up")}
                  onMoveDown={() => runItemAction("book", book.meta.slug, "move-down")}
                  disableMoveUp={bookIndex === 0}
                  disableMoveDown={bookIndex === localTree.books.length - 1}
                  onDuplicate={() => runItemAction("book", book.meta.slug, "duplicate")}
                  onDelete={() => runItemAction("book", book.meta.slug, "delete")}
                  onDownload={() => runItemAction("book", book.meta.slug, "download")}
                />
              </div>

              {!collapsedBooks[book.meta.slug] ? (
                <div className="grid gap-1 border-l border-[rgba(73,57,38,0.12)] pl-1">
                  {renderChapterTree(book.meta.slug, book.chapters)}
                </div>
              ) : null}
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
          {localTree.notes.map((note, noteIndex) => (
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
                onMoveUp={() => runItemAction("note", note.meta.slug, "move-up")}
                onMoveDown={() => runItemAction("note", note.meta.slug, "move-down")}
                disableMoveUp={noteIndex === 0}
                disableMoveDown={noteIndex === localTree.notes.length - 1}
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
        {session ? (
          <div className="mt-4 rounded-[18px] border border-[var(--paper-border)] bg-[rgba(255,252,247,0.82)] px-3 py-2">
            <p className="paper-label mb-1">Signed in</p>
            <p className="text-sm font-semibold text-[var(--paper-ink)]">
              {session.username}
            </p>
            <p className="text-sm text-[var(--paper-muted)]">{session.role}</p>
          </div>
        ) : null}
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--paper-muted)]">
          <BarChart3 className="h-4 w-4" />
          Analytics status lives in Settings.
        </div>
      </div>
    </>
  );
}
