"use client";

import JSZip from "jszip";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookMarked,
  ChevronDown,
  ChevronRight,
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

type DropIndicator = {
  bookSlug: string;
  chapterPath: string[];
  position: "before" | "after";
};

type CollectionDropIndicator = {
  slug: string;
  position: "before" | "after";
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

function applyChapterOrder(
  tree: ContentTree,
  bookSlug: string,
  parentChapterPath: string[],
  chapterSlugs: string[],
): ContentTree {
  const reorderSiblings = (
    chapters: ChapterTreeNode[],
    parentPath: string[],
  ): ChapterTreeNode[] => {
    if (parentPath.length === 0) {
      const chapterMap = new Map(
        chapters.map((chapter) => [chapter.meta.slug, chapter] as const),
      );
      return chapterSlugs.map((slug, index) => {
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
      });
    }

    const [head, ...tail] = parentPath;
    return chapters.map((chapter) => {
      if (chapter.meta.slug !== head) {
        return chapter;
      }

      return {
        ...chapter,
        children: reorderSiblings(chapter.children, tail),
      };
    });
  };

  return {
    ...tree,
    books: tree.books.map((book) => {
      if (book.meta.slug !== bookSlug) {
        return book;
      }

      return {
        ...book,
        chapters: reorderSiblings(book.chapters, parentChapterPath),
      };
    }),
  };
}

function chaptersAtPath(
  chapters: ChapterTreeNode[],
  parentPath: string[],
): ChapterTreeNode[] | null {
  if (parentPath.length === 0) {
    return chapters;
  }

  const [head, ...tail] = parentPath;
  const parent = chapters.find((chapter) => chapter.meta.slug === head);
  if (!parent) {
    return null;
  }

  return chaptersAtPath(parent.children, tail);
}

function getReorderedSlugs(
  entries: Array<{ meta: { slug: string } }>,
  draggedSlug: string,
  targetSlug: string,
  position: "before" | "after",
) {
  const nextSlugs = entries.map((entry) => entry.meta.slug);
  const fromIndex = nextSlugs.indexOf(draggedSlug);
  const targetIndex = nextSlugs.indexOf(targetSlug);

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

  const [movedSlug] = nextSlugs.splice(fromIndex, 1);
  nextSlugs.splice(nextIndex, 0, movedSlug);
  return nextSlugs;
}

function getVerticalDropPosition(event: React.DragEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY - bounds.top > bounds.height / 2 ? "after" : "before";
}

function applyBookOrder(tree: ContentTree, bookSlugs: string[]): ContentTree {
  const bookMap = new Map(tree.books.map((book) => [book.meta.slug, book] as const));
  return {
    ...tree,
    books: bookSlugs.map((slug, index) => {
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

function applyNoteOrder(tree: ContentTree, noteSlugs: string[]): ContentTree {
  const noteMap = new Map(tree.notes.map((note) => [note.meta.slug, note] as const));
  return {
    ...tree,
    notes: noteSlugs.map((slug, index) => {
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
  dragHandle,
  dragging = false,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  trailingAction,
  draggableItem = false,
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
  draggableItem?: boolean;
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
      draggable={draggableItem}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2">
        <Link
          href={href}
          draggable={false}
          className={cn(
            "paper-nav-link min-w-0 flex-1",
            active && "paper-nav-link-active",
            chapter && "pl-3 text-[0.97rem]",
            dragging && "opacity-55",
          )}
        >
          <span className="flex items-start gap-2">
            {dragHandle ? (
              <span
                className={cn(
                  "inline-flex shrink-0 cursor-grab items-center pt-0.5 text-[var(--paper-muted)]",
                  dragging && "cursor-grabbing",
                )}
                draggable={false}
                aria-hidden="true"
              >
                {dragHandle}
              </span>
            ) : null}
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
        className="icon-plain-button"
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
  generalSettings,
  session,
}: AuthoringSidebarProps) {
  const router = useRouter();
  const [localTree, setLocalTree] = useState(tree);
  const [collapsedBooks, setCollapsedBooks] = useState<Record<string, boolean>>(() =>
    defaultCollapsedBooks(tree, currentPath, generalSettings),
  );
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});
  const [draggedChapter, setDraggedChapter] = useState<{
    bookSlug: string;
    chapterPath: string[];
    parentPath: string[];
  } | null>(null);
  const [draggedBookSlug, setDraggedBookSlug] = useState<string | null>(null);
  const [draggedNoteSlug, setDraggedNoteSlug] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [bookDropIndicator, setBookDropIndicator] = useState<CollectionDropIndicator | null>(null);
  const [noteDropIndicator, setNoteDropIndicator] = useState<CollectionDropIndicator | null>(null);
  const [pendingBookSlug, setPendingBookSlug] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
    action: "duplicate" | "delete" | "download",
  ) => {
    const actionId = `${kind}:${slug}:${action}`;
    if (action === "download") {
      void downloadItem(kind, slug);
      return;
    }

    setOpenMenuId(null);
    setActionError(null);

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
                  return `/api/books/${bookSlug}/chapters/${chapterPath.join("/")}${action === "duplicate" ? "/duplicate" : ""}`;
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

  const handleDrop = (
    bookSlug: string,
    parentChapterPath: string[],
    targetSlug: string,
    position: "before" | "after",
  ) => {
    if (
      !draggedChapter ||
      draggedChapter.bookSlug !== bookSlug ||
      draggedChapter.parentPath.join("/") !== parentChapterPath.join("/")
    ) {
      setDropIndicator(null);
      return;
    }

    const book = localTree.books.find((entry) => entry.meta.slug === bookSlug);
    if (!book) {
      setDropIndicator(null);
      return;
    }

    const siblings = chaptersAtPath(book.chapters, parentChapterPath);
    if (!siblings) {
      setDropIndicator(null);
      return;
    }

    const nextChapterSlugs = getReorderedSlugs(
      siblings,
      draggedChapter.chapterPath[draggedChapter.chapterPath.length - 1] ?? "",
      targetSlug,
      position,
    );

    setDropIndicator(null);
    setDraggedChapter(null);

    if (!nextChapterSlugs) {
      return;
    }

    const previousTree = localTree;
    const nextTree = applyChapterOrder(localTree, bookSlug, parentChapterPath, nextChapterSlugs);
    setLocalTree(nextTree);
    setPendingBookSlug(bookSlug);
    setActionError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/books/${bookSlug}/chapters/reorder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            parentChapterPath,
            chapterSlugs: nextChapterSlugs,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Chapter reorder failed");
        }

        router.refresh();
      } catch (error) {
        setLocalTree(previousTree);
        setActionError(
          error instanceof Error ? error.message : "Chapter reorder failed",
        );
      } finally {
        setPendingBookSlug(null);
      }
    });
  };

  const handleBookDrop = (targetSlug: string, position: "before" | "after") => {
    if (!draggedBookSlug) {
      setBookDropIndicator(null);
      return;
    }

    const nextBookSlugs = getReorderedSlugs(
      localTree.books,
      draggedBookSlug,
      targetSlug,
      position,
    );

    setBookDropIndicator(null);
    setDraggedBookSlug(null);

    if (!nextBookSlugs) {
      return;
    }

    const previousTree = localTree;
    setLocalTree(applyBookOrder(localTree, nextBookSlugs));
    setActionError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/books/reorder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ bookSlugs: nextBookSlugs }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Book reorder failed");
        }

        router.refresh();
      } catch (error) {
        setLocalTree(previousTree);
        setActionError(error instanceof Error ? error.message : "Book reorder failed");
      }
    });
  };

  const handleNoteDrop = (targetSlug: string, position: "before" | "after") => {
    if (!draggedNoteSlug) {
      setNoteDropIndicator(null);
      return;
    }

    const nextNoteSlugs = getReorderedSlugs(
      localTree.notes,
      draggedNoteSlug,
      targetSlug,
      position,
    );

    setNoteDropIndicator(null);
    setDraggedNoteSlug(null);

    if (!nextNoteSlugs) {
      return;
    }

    const previousTree = localTree;
    setLocalTree(applyNoteOrder(localTree, nextNoteSlugs));
    setActionError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/notes/reorder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ noteSlugs: nextNoteSlugs }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Note reorder failed");
        }

        router.refresh();
      } catch (error) {
        setLocalTree(previousTree);
        setActionError(error instanceof Error ? error.message : "Note reorder failed");
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

  const renderChapterTree = (bookSlug: string, chapters: ChapterTreeNode[], depth = 0) =>
    chapters.map((chapter) => {
      const chapterPath = `/app/books/${bookSlug}/chapters/${chapter.path.join("/")}`;
      const chapterActionSlug = encodeChapterActionSlug(bookSlug, chapter.path);
      const indicator =
        dropIndicator?.bookSlug === bookSlug &&
        dropIndicator.chapterPath.join("/") === chapter.path.join("/")
          ? dropIndicator.position
          : null;
      const collapsed = isChapterCollapsed(bookSlug, chapter.path);

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
                draggableItem
                dragging={
                  draggedChapter?.bookSlug === bookSlug &&
                  draggedChapter.chapterPath.join("/") === chapter.path.join("/")
                }
                dropIndicator={indicator}
                dragHandle={
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--paper-muted)]" />
                }
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
                    bookSlug,
                    chapterPath: chapter.path,
                    parentPath: chapter.path.slice(0, -1),
                  });
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", chapter.path.join("/"));
                }}
                onDragEnd={() => {
                  setDraggedChapter(null);
                  setDropIndicator(null);
                }}
                onDragOver={(event) => {
                  if (
                    !draggedChapter ||
                    draggedChapter.bookSlug !== bookSlug ||
                    draggedChapter.parentPath.join("/") !==
                      chapter.path.slice(0, -1).join("/") ||
                    draggedChapter.chapterPath.join("/") === chapter.path.join("/")
                  ) {
                    return;
                  }

                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  const position = getVerticalDropPosition(event);

                  setDropIndicator({
                    bookSlug,
                    chapterPath: chapter.path,
                    position,
                  });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const position = getVerticalDropPosition(event);
                  handleDrop(
                    bookSlug,
                    chapter.path.slice(0, -1),
                    chapter.meta.slug,
                    position,
                  );
                }}
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

      <div className="grid gap-2">
        <NavLink href="/app" label="Dashboard" active={currentPath === "/app"} />
        {session?.role === "admin" ? (
          <>
            <NavLink
              href="/app/settings/general"
              label="General settings"
              active={currentPath === "/app/settings/general"}
            />
            <NavLink
              href="/app/settings/errors"
              label="Errors"
              active={currentPath === "/app/settings/errors"}
            />
          </>
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
          {localTree.books.map((book) => (
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
                  {(() => {
                    const indicator =
                      bookDropIndicator?.slug === book.meta.slug
                        ? bookDropIndicator.position
                        : null;

                    return (
                  <NavLink
                    href={`/app/books/${book.meta.slug}`}
                    label={book.meta.title}
                    active={currentPath === `/app/books/${book.meta.slug}`}
                    dragging={draggedBookSlug === book.meta.slug}
                    dropIndicator={indicator}
                    draggableItem
                    dragHandle={
                      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--paper-muted)]" />
                    }
                    onDragStart={(event) => {
                      setDraggedBookSlug(book.meta.slug);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", book.meta.slug);
                    }}
                    onDragEnd={() => {
                      setDraggedBookSlug(null);
                      setBookDropIndicator(null);
                    }}
                    onDragOver={(event) => {
                      if (!draggedBookSlug || draggedBookSlug === book.meta.slug) {
                        return;
                      }

                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const position = getVerticalDropPosition(event);

                      setBookDropIndicator({
                        slug: book.meta.slug,
                        position,
                      });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const position = getVerticalDropPosition(event);
                      handleBookDrop(
                        book.meta.slug,
                        position,
                      );
                    }}
                  />
                    );
                  })()}
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
          {localTree.notes.map((note) => (
            <div key={note.meta.slug} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                {(() => {
                  const indicator =
                    noteDropIndicator?.slug === note.meta.slug
                      ? noteDropIndicator.position
                      : null;

                  return (
                <NavLink
                  href={`/app/notes/${note.meta.slug}`}
                  label={note.meta.title}
                  active={currentPath === `/app/notes/${note.meta.slug}`}
                  dragging={draggedNoteSlug === note.meta.slug}
                  dropIndicator={indicator}
                  draggableItem
                  dragHandle={
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--paper-muted)]" />
                  }
                  onDragStart={(event) => {
                    setDraggedNoteSlug(note.meta.slug);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", note.meta.slug);
                  }}
                  onDragEnd={() => {
                    setDraggedNoteSlug(null);
                    setNoteDropIndicator(null);
                  }}
                    onDragOver={(event) => {
                      if (!draggedNoteSlug || draggedNoteSlug === note.meta.slug) {
                        return;
                      }

                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const position = getVerticalDropPosition(event);

                      setNoteDropIndicator({
                        slug: note.meta.slug,
                        position,
                    });
                  }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const position = getVerticalDropPosition(event);
                      handleNoteDrop(
                        note.meta.slug,
                        position,
                      );
                    }}
                  />
                  );
                })()}
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
