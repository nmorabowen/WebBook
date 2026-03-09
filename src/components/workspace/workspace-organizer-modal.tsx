"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { FolderTree, Search, X } from "lucide-react";
import { buildChapterNumberIndex } from "@/lib/chapter-numbering";
import { ChapterMoveDialog } from "@/components/chapter-move-dialog";
import type { ContentTree } from "@/lib/content/schemas";
import { buildChapterMoveDestinationOptions } from "@/components/workspace/use-chapter-move-options";
import {
  findChapterNode,
  findChapterSiblings,
  flattenBookChapterRefs,
  parseWorkspaceRoute,
} from "@/components/workspace/tree-utils";
import type { OrganizerNodeRef } from "@/components/workspace/types";
import { useWorkspaceTreeActions } from "@/components/workspace/use-workspace-tree-actions";
import { cn } from "@/lib/utils";

type OrganizerItem = {
  id: string;
  ref: OrganizerNodeRef;
  kind: OrganizerNodeRef["kind"];
  title: string;
  subtitle: string;
  depth: number;
  search: string;
};

const ORGANIZER_QUERY_STORAGE_KEY = "webbook.organizer.query";
const ORGANIZER_SELECTION_STORAGE_KEY = "webbook.organizer.selection";

function selectionId(ref: OrganizerNodeRef) {
  if (ref.kind === "book") {
    return `book:${ref.slug}`;
  }
  if (ref.kind === "note") {
    return `note:${ref.slug}`;
  }
  return `chapter:${ref.bookSlug}/${ref.chapterPath.join("/")}`;
}

function parsePosition(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

export function WorkspaceOrganizerModal({
  open,
  tree,
  currentPath,
  onClose,
}: {
  open: boolean;
  tree: Pick<ContentTree, "books" | "notes">;
  currentPath?: string;
  onClose: () => void;
}) {
  const actions = useWorkspaceTreeActions(currentPath);
  const [search, setSearch] = useState("");
  const [selectedRef, setSelectedRef] = useState<OrganizerNodeRef | null>(null);
  const [draftTitle, setDraftTitle] = useState("New item");
  const [position, setPosition] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [movePending, setMovePending] = useState(false);
  const [noteMoveBookSlug, setNoteMoveBookSlug] = useState("");
  const [noteMoveParentKey, setNoteMoveParentKey] = useState("");
  const [noteMoveOrder, setNoteMoveOrder] = useState("");

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    try {
      const storedQuery = window.localStorage.getItem(ORGANIZER_QUERY_STORAGE_KEY);
      if (storedQuery !== null) {
        setSearch(storedQuery);
      }
      const storedSelection = window.localStorage.getItem(ORGANIZER_SELECTION_STORAGE_KEY);
      if (storedSelection) {
        if (storedSelection.startsWith("book:")) {
          setSelectedRef({ kind: "book", slug: storedSelection.slice("book:".length) });
        } else if (storedSelection.startsWith("note:")) {
          setSelectedRef({ kind: "note", slug: storedSelection.slice("note:".length) });
        } else if (storedSelection.startsWith("chapter:")) {
          const value = storedSelection.slice("chapter:".length);
          const [bookSlug, ...chapterPath] = value.split("/").filter(Boolean);
          if (bookSlug && chapterPath.length) {
            setSelectedRef({ kind: "chapter", bookSlug, chapterPath });
          }
        }
      }
    } catch {}
  }, [open]);

  const items = useMemo(() => {
    const next: OrganizerItem[] = [];
    for (const book of tree.books) {
      next.push({
        id: `book:${book.meta.slug}`,
        ref: { kind: "book", slug: book.meta.slug },
        kind: "book",
        title: book.meta.title,
        subtitle: `/app/books/${book.meta.slug}`,
        depth: 0,
        search: `book ${book.meta.title} ${book.meta.slug}`.toLowerCase(),
      });
      const chapterNumbers = buildChapterNumberIndex(book.chapters);
      for (const chapter of flattenBookChapterRefs(book.meta.slug, book.chapters)) {
        const key = chapter.path.join("/");
        const number = chapterNumbers.get(key);
        next.push({
          id: `chapter:${book.meta.slug}/${key}`,
          ref: { kind: "chapter", bookSlug: book.meta.slug, chapterPath: chapter.path },
          kind: "chapter",
          title: number ? `${number} ${chapter.title}` : chapter.title,
          subtitle: `/app/books/${book.meta.slug}/chapters/${key}`,
          depth: chapter.path.length,
          search: `chapter ${chapter.title} ${book.meta.title} ${key}`.toLowerCase(),
        });
      }
    }

    for (const note of tree.notes) {
      next.push({
        id: `note:${note.meta.slug}`,
        ref: { kind: "note", slug: note.meta.slug },
        kind: "note",
        title: note.meta.title,
        subtitle: `/app/notes/${note.meta.slug}`,
        depth: 0,
        search: `note ${note.meta.title} ${note.meta.slug}`.toLowerCase(),
      });
    }
    return next;
  }, [tree.books, tree.notes]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return items;
    }
    return items.filter((item) => item.search.includes(query));
  }, [items, search]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const route = parseWorkspaceRoute(currentPath);
    let nextRef: OrganizerNodeRef | null = null;
    if (route?.kind === "book") {
      nextRef = { kind: "book", slug: route.slug };
    }
    if (route?.kind === "note") {
      nextRef = { kind: "note", slug: route.slug };
    }
    if (route?.kind === "chapter") {
      nextRef = {
        kind: "chapter",
        bookSlug: route.bookSlug,
        chapterPath: route.chapterPath,
      };
    }

    if (nextRef) {
      const nextId = selectionId(nextRef);
      setSelectedRef((current) =>
        current && selectionId(current) === nextId ? current : nextRef,
      );
      return;
    }

    setSelectedRef((current) => current ?? (items[0]?.ref ?? null));
  }, [currentPath, items, open]);

  const selectedId = selectedRef ? selectionId(selectedRef) : null;
  const selectedItem = selectedId ? items.find((item) => item.id === selectedId) ?? null : null;
  const selectedBook =
    selectedRef?.kind === "book"
      ? tree.books.find((book) => book.meta.slug === selectedRef.slug) ?? null
      : selectedRef?.kind === "chapter"
        ? tree.books.find((book) => book.meta.slug === selectedRef.bookSlug) ?? null
        : null;
  const selectedNote =
    selectedRef?.kind === "note"
      ? tree.notes.find((note) => note.meta.slug === selectedRef.slug) ?? null
      : null;
  const selectedChapter =
    selectedRef?.kind === "chapter" && selectedBook
      ? findChapterNode(selectedBook.chapters, selectedRef.chapterPath)
      : null;
  const chapterSiblings =
    selectedRef?.kind === "chapter" && selectedBook
      ? findChapterSiblings(selectedBook.chapters, selectedRef.chapterPath.slice(0, -1))
      : null;
  const chapterIndex =
    selectedRef?.kind === "chapter" && chapterSiblings
      ? chapterSiblings.findIndex(
          (entry) => entry.meta.slug === selectedRef.chapterPath[selectedRef.chapterPath.length - 1],
        )
      : -1;

  const run = async (id: string, fn: () => Promise<void>) => {
    setPending(id);
    setError(null);
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setPending(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(ORGANIZER_QUERY_STORAGE_KEY, search);
    } catch {}
  }, [search]);

  useEffect(() => {
    if (!selectedId || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(ORGANIZER_SELECTION_STORAGE_KEY, selectedId);
    } catch {}
  }, [selectedId]);

  useEffect(() => {
    if (selectedRef?.kind !== "note") {
      return;
    }

    const fallbackBookSlug = tree.books[0]?.meta.slug ?? "";
    setNoteMoveBookSlug((current) =>
      current && tree.books.some((book) => book.meta.slug === current)
        ? current
        : fallbackBookSlug,
    );
    setNoteMoveParentKey("");
    setNoteMoveOrder("");
  }, [selectedRef, tree.books]);

  const noteMoveBook = tree.books.find((book) => book.meta.slug === noteMoveBookSlug) ?? null;
  const noteMoveOptions = noteMoveBook
    ? buildChapterMoveDestinationOptions(noteMoveBook.chapters, [])
    : [];
  const noteMoveParentPath =
    noteMoveOptions.find((option) => option.key === noteMoveParentKey)?.parentPath ?? [];
  const noteMoveSiblingCount =
    noteMoveBook === null
      ? 0
      : noteMoveParentPath.length === 0
        ? noteMoveBook.chapters.length
        : (findChapterSiblings(noteMoveBook.chapters, noteMoveParentPath)?.length ?? 0);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(24,18,13,0.42)] p-4">
        <div className="grid h-[85vh] w-full max-w-6xl grid-cols-[minmax(280px,0.45fr)_minmax(0,0.55fr)] gap-4 rounded-[28px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.98)] p-5">
          <div className="grid min-h-0 gap-3 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="paper-label">Organizer</p>
                <h2 className="font-serif text-2xl">Workspace structure</h2>
              </div>
              <button type="button" className="icon-plain-button" onClick={onClose}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--paper-muted)]" />
              <input
                className="paper-input pl-9"
                placeholder="Search..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="min-h-0 overflow-y-auto rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-2">
              {filtered.length ? (
                <div className="grid gap-1">
                  {filtered.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "rounded-[12px] px-3 py-2 text-left transition",
                        selectedId === item.id
                          ? "bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]"
                          : "hover:bg-[rgba(132,99,63,0.12)]",
                      )}
                      style={{ paddingLeft: `${12 + Math.max(0, item.depth - 1) * 12}px` }}
                      onClick={() => {
                        setSelectedRef(item.ref);
                        setError(null);
                        setPosition("");
                      }}
                    >
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--paper-muted)]">
                        {item.kind}
                      </p>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-[var(--paper-muted)]">{item.subtitle}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-2 py-1 text-sm text-[var(--paper-muted)]">No items found.</p>
              )}
            </div>
          </div>

          <div className="grid min-h-0 gap-3 rounded-[20px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-4">
            <div>
              <p className="paper-label">Actions</p>
              <h3 className="font-serif text-2xl">{selectedItem?.title ?? "Select an item"}</h3>
              <p className="text-sm text-[var(--paper-muted)]">
                {selectedItem?.subtitle ?? "Choose an item on the left to organize."}
              </p>
            </div>
            {error ? (
              <div className="rounded-[16px] border border-[rgba(145,47,47,0.2)] bg-[rgba(145,47,47,0.08)] px-3 py-2 text-sm text-[var(--paper-danger)]">
                {error}
              </div>
            ) : null}

            <div className="min-h-0 overflow-y-auto">
              {selectedRef?.kind === "book" && selectedBook ? (
                <div className="grid gap-3">
                  <div className="rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-3">
                    <p className="paper-label mb-1">Create</p>
                    <input className="paper-input" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("create-book", async () => {
                        const payload = await actions.createBook(draftTitle);
                        if (payload.meta?.slug) {
                          setSelectedRef({ kind: "book", slug: payload.meta.slug });
                        }
                      })}>Create book</button>
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null} onClick={() => void run("create-root-from-book", async () => {
                        const payload = await actions.createChapter(tree, selectedBook.meta.slug, draftTitle, []);
                        if (payload.path?.length) {
                          setSelectedRef({ kind: "chapter", bookSlug: selectedBook.meta.slug, chapterPath: payload.path });
                        }
                      })}>Create root chapter</button>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-3">
                    <p className="paper-label mb-1">Reorder</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null || tree.books.findIndex((book) => book.meta.slug === selectedBook.meta.slug) === 0} onClick={() => void run("book-up", () => actions.moveBookByStep(tree, selectedBook.meta.slug, "up").then(() => undefined))}>Move up</button>
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null || tree.books.findIndex((book) => book.meta.slug === selectedBook.meta.slug) === tree.books.length - 1} onClick={() => void run("book-down", () => actions.moveBookByStep(tree, selectedBook.meta.slug, "down").then(() => undefined))}>Move down</button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input className="paper-input" inputMode="numeric" value={position} onChange={(event) => setPosition(event.target.value)} placeholder={`Position 1-${Math.max(tree.books.length, 1)}`} />
                      <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("book-position", async () => {
                        const nextPosition = parsePosition(position);
                        if (!nextPosition) throw new Error("Position must be a positive integer.");
                        await actions.moveBookToPosition(tree, selectedBook.meta.slug, nextPosition);
                      })}>Apply</button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null} onClick={() => void run("dup-book", async () => {
                      const payload = await actions.duplicateBook(selectedBook.meta.slug);
                      if (payload.meta?.slug) setSelectedRef({ kind: "book", slug: payload.meta.slug });
                    })}>Duplicate</button>
                    <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("del-book", async () => {
                      if (!window.confirm("Delete this book?")) return;
                      await actions.deleteBook(selectedBook.meta.slug);
                      setSelectedRef(null);
                    })}>Delete</button>
                  </div>
                </div>
              ) : null}

              {selectedRef?.kind === "note" && selectedNote ? (
                <div className="grid gap-3">
                  <div className="rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-3">
                    <p className="paper-label mb-1">Create note</p>
                    <input className="paper-input" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                    <button type="button" className="paper-button mt-2" disabled={pending !== null} onClick={() => void run("create-note", async () => {
                      const payload = await actions.createNote(draftTitle);
                      if (payload.meta?.slug) setSelectedRef({ kind: "note", slug: payload.meta.slug });
                    })}>Create note</button>
                  </div>

                  <div className="rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-3">
                    <p className="paper-label mb-1">Reorder</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null || tree.notes.findIndex((note) => note.meta.slug === selectedNote.meta.slug) === 0} onClick={() => void run("note-up", () => actions.moveNoteByStep(tree, selectedNote.meta.slug, "up").then(() => undefined))}>Move up</button>
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null || tree.notes.findIndex((note) => note.meta.slug === selectedNote.meta.slug) === tree.notes.length - 1} onClick={() => void run("note-down", () => actions.moveNoteByStep(tree, selectedNote.meta.slug, "down").then(() => undefined))}>Move down</button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input className="paper-input" inputMode="numeric" value={position} onChange={(event) => setPosition(event.target.value)} placeholder={`Position 1-${Math.max(tree.notes.length, 1)}`} />
                      <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("note-position", async () => {
                        const nextPosition = parsePosition(position);
                        if (!nextPosition) throw new Error("Position must be a positive integer.");
                        await actions.moveNoteToPosition(tree, selectedNote.meta.slug, nextPosition);
                      })}>Apply</button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null} onClick={() => void run("dup-note", async () => {
                      const payload = await actions.duplicateNote(selectedNote.meta.slug);
                      if (payload.meta?.slug) setSelectedRef({ kind: "note", slug: payload.meta.slug });
                    })}>Duplicate</button>
                    <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null || !tree.books.length} onClick={() => void run("move-note-into-book", async () => {
                      if (!noteMoveBookSlug) {
                        throw new Error("Select a destination book.");
                      }
                      const nextPosition = noteMoveOrder ? parsePosition(noteMoveOrder) : null;
                      if (noteMoveOrder && !nextPosition) {
                        throw new Error("Position must be a positive integer.");
                      }
                      const payload = await actions.moveNoteToBook(
                        selectedNote.meta.slug,
                        noteMoveBookSlug,
                        noteMoveParentPath,
                        nextPosition ?? undefined,
                      );
                      if (payload.path?.length) {
                        setSelectedRef({
                          kind: "chapter",
                          bookSlug: payload.meta?.bookSlug ?? noteMoveBookSlug,
                          chapterPath: payload.path,
                        });
                      }
                    })}>Move into book</button>
                    <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("del-note", async () => {
                      if (!window.confirm("Delete this note?")) return;
                      await actions.deleteNote(selectedNote.meta.slug);
                      setSelectedRef(null);
                    })}>Delete</button>
                  </div>
                  <div className="rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-3">
                    <p className="paper-label mb-1">Move into book</p>
                    {tree.books.length ? (
                      <div className="grid gap-2">
                        <select className="paper-select" value={noteMoveBookSlug} onChange={(event) => {
                          setNoteMoveBookSlug(event.target.value);
                          setNoteMoveParentKey("");
                          setNoteMoveOrder("");
                        }}>
                          {tree.books.map((book) => (
                            <option key={book.meta.slug} value={book.meta.slug}>
                              {book.meta.title}
                            </option>
                          ))}
                        </select>
                        <select className="paper-select" value={noteMoveParentKey} onChange={(event) => setNoteMoveParentKey(event.target.value)}>
                          {noteMoveOptions.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label} ({option.subtitle})
                            </option>
                          ))}
                        </select>
                        <input className="paper-input" inputMode="numeric" value={noteMoveOrder} onChange={(event) => setNoteMoveOrder(event.target.value)} placeholder={`Position 1-${Math.max(noteMoveSiblingCount + 1, 1)} (optional)`} />
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--paper-muted)]">Create a book first.</p>
                    )}
                  </div>
                </div>
              ) : null}

              {selectedRef?.kind === "chapter" && selectedBook && selectedChapter ? (
                <div className="grid gap-3">
                  <div className="rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-3">
                    <p className="paper-label mb-1">Create chapter</p>
                    <input className="paper-input" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null} onClick={() => void run("create-root-chapter", async () => {
                        const payload = await actions.createChapter(tree, selectedBook.meta.slug, draftTitle, []);
                        if (payload.path?.length) setSelectedRef({ kind: "chapter", bookSlug: selectedBook.meta.slug, chapterPath: payload.path });
                      })}>Create root chapter</button>
                      <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("create-subchapter", async () => {
                        const payload = await actions.createChapter(tree, selectedBook.meta.slug, draftTitle, selectedRef.chapterPath);
                        if (payload.path?.length) setSelectedRef({ kind: "chapter", bookSlug: selectedBook.meta.slug, chapterPath: payload.path });
                      })}>Create subchapter</button>
                    </div>
                  </div>

                  <div className="rounded-[16px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.72)] p-3">
                    <p className="paper-label mb-1">Reorder</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null || chapterIndex <= 0} onClick={() => void run("chapter-up", () => actions.moveChapterByStep(tree, selectedBook.meta.slug, selectedRef.chapterPath, "up").then(() => undefined))}>Move up</button>
                      <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null || !chapterSiblings || chapterIndex >= chapterSiblings.length - 1} onClick={() => void run("chapter-down", () => actions.moveChapterByStep(tree, selectedBook.meta.slug, selectedRef.chapterPath, "down").then(() => undefined))}>Move down</button>
                      <button type="button" className="paper-button" disabled={pending !== null} onClick={() => {
                        setMoveError(null);
                        setMoveOpen(true);
                      }}>Move chapter...</button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input className="paper-input" inputMode="numeric" value={position} onChange={(event) => setPosition(event.target.value)} placeholder={`Position 1-${Math.max(chapterSiblings?.length ?? 1, 1)}`} />
                      <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("chapter-position", async () => {
                        const nextPosition = parsePosition(position);
                        if (!nextPosition) throw new Error("Position must be a positive integer.");
                        await actions.moveChapter(selectedBook.meta.slug, selectedRef.chapterPath, selectedRef.chapterPath.slice(0, -1), nextPosition);
                      })}>Apply</button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="paper-button paper-button-secondary" disabled={pending !== null} onClick={() => void run("dup-chapter", async () => {
                      const payload = await actions.duplicateChapter(selectedBook.meta.slug, selectedRef.chapterPath);
                      if (payload.path?.length) setSelectedRef({ kind: "chapter", bookSlug: selectedBook.meta.slug, chapterPath: payload.path });
                    })}>Duplicate</button>
                    <button type="button" className="paper-button" disabled={pending !== null} onClick={() => void run("del-chapter", async () => {
                      if (!window.confirm("Delete this chapter subtree?")) return;
                      await actions.deleteChapter(selectedBook.meta.slug, selectedRef.chapterPath);
                      setSelectedRef({ kind: "book", slug: selectedBook.meta.slug });
                    })}>Delete</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {moveOpen && selectedRef?.kind === "chapter" && selectedBook && selectedChapter ? (
        <ChapterMoveDialog
          bookSlug={selectedBook.meta.slug}
          chapterTitle={selectedChapter.meta.title}
          chapterPath={selectedRef.chapterPath}
          bookChapters={selectedBook.chapters}
          initialParentPath={selectedRef.chapterPath.slice(0, -1)}
          busy={movePending}
          errorMessage={moveError}
          onClose={() => setMoveOpen(false)}
          onSubmit={(input) => {
            setMovePending(true);
            setMoveError(null);
            void actions
              .moveChapter(
                selectedBook.meta.slug,
                selectedRef.chapterPath,
                input.parentChapterPath,
                input.order,
              )
              .then((payload) => {
                setMoveOpen(false);
                if (payload.path?.length) {
                  setSelectedRef({
                    kind: "chapter",
                    bookSlug: selectedBook.meta.slug,
                    chapterPath: payload.path,
                  });
                }
              })
              .catch((cause) =>
                setMoveError(cause instanceof Error ? cause.message : "Unable to move chapter."),
              )
              .finally(() => setMovePending(false));
          }}
        />
      ) : null}
    </>,
    document.body,
  );
}

export function WorkspaceOrganizerLauncher({
  tree,
  currentPath,
  buttonLabel = "Organizer",
  buttonClassName,
}: {
  tree: Pick<ContentTree, "books" | "notes">;
  currentPath?: string;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={cn("paper-button paper-button-secondary inline-flex items-center gap-2", buttonClassName)}
        onClick={() => setOpen(true)}
      >
        <FolderTree className="h-4 w-4" />
        {buttonLabel}
      </button>
      <WorkspaceOrganizerModal
        open={open}
        tree={tree}
        currentPath={currentPath}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
