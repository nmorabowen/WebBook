"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { BookMarked, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useContentTreeModel } from "@/components/workspace/use-content-tree-model";
import type {
  ChapterTreeNode,
  ContentTree,
} from "@/lib/content/schemas";
import {
  type DropPosition,
  type NodeRef,
} from "@/components/workspace/tree-drop-dispatch";
import { useTreeDrop } from "@/components/workspace/use-tree-drop";
import { useTreeActions } from "@/components/workspace/use-tree-actions";
import { cn } from "@/lib/utils";

const EXPAND_STORAGE_KEY = "webbook.content-tree-sidebar.expand";

type ExpandState = Record<string, boolean>;

function nodeKey(kind: "book" | "chapter", ...parts: string[]) {
  return `${kind}:${parts.join("/")}`;
}

/** Lookup key for chapter-scoped notes — `<bookSlug>::<chapterPath>`. */
function scopedChapterKey(bookSlug: string, chapterPath: string[]) {
  return `${bookSlug}::${chapterPath.join("/")}`;
}

function refId(ref: NodeRef): string {
  switch (ref.kind) {
    case "book":
      return `book:${ref.slug}`;
    case "note":
      return `note:${ref.slug}`;
    case "chapter":
      return `chapter:${ref.bookSlug}/${ref.chapterPath.join("/")}`;
    case "notes-root":
      return "notes-root";
  }
}

function refLabel(ref: NodeRef, tree: ContentTree | null): string {
  if (!tree) return refId(ref);
  if (ref.kind === "book") {
    return tree.books.find((b) => b.meta.slug === ref.slug)?.meta.title ?? ref.slug;
  }
  if (ref.kind === "note") {
    return tree.notes.find((n) => n.meta.slug === ref.slug)?.meta.title ?? ref.slug;
  }
  if (ref.kind === "chapter") {
    const book = tree.books.find((b) => b.meta.slug === ref.bookSlug);
    if (!book) return ref.chapterPath.join(" / ");
    const found = findChapter(book.chapters, ref.chapterPath);
    return found?.meta.title ?? ref.chapterPath.join(" / ");
  }
  return "Notes";
}

function findChapter(
  chapters: ChapterTreeNode[],
  path: string[],
): ChapterTreeNode | null {
  if (path.length === 0) return null;
  const [head, ...tail] = path;
  const node = chapters.find((c) => c.meta.slug === head);
  if (!node) return null;
  if (tail.length === 0) return node;
  return findChapter(node.children, tail);
}

function loadExpandState(): ExpandState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(EXPAND_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ExpandState;
    }
    return {};
  } catch {
    return {};
  }
}

export function ContentTreeSidebar({
  currentPath,
  initialTree,
  initialRevision,
}: {
  currentPath?: string;
  initialTree?: ContentTree;
  initialRevision?: string;
}) {
  const model = useContentTreeModel(
    initialTree
      ? { initialTree, ...(initialRevision ? { initialRevision } : {}) }
      : undefined,
  );
  // Skip SSR rendering: @dnd-kit allocates internal IDs from a shared counter
  // that drifts between server and client, causing hydration mismatches on
  // aria-describedby. Rendering only after mount sidesteps the problem and
  // is acceptable for an authoring-only sidebar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [expanded, setExpanded] = useState<ExpandState>(() => loadExpandState());
  const [activeDrag, setActiveDrag] = useState<NodeRef | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const pointerYRef = useRef<number>(0);

  const doDrop = useTreeDrop(model);
  const treeActions = useTreeActions(model);
  const [menuFor, setMenuFor] = useState<NodeRef | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    overId: string;
    position: DropPosition;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(EXPAND_STORAGE_KEY, JSON.stringify(expanded));
    } catch {
      // Quota / access errors are non-fatal.
    }
  }, [expanded]);

  const toggle = useCallback((key: string, defaultOpen: boolean) => {
    setExpanded((prev) => {
      const current = prev[key] ?? defaultOpen;
      return { ...prev, [key]: !current };
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const announcements = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        return `Picked up ${active.id}. Use arrow keys to move, space to drop, escape to cancel.`;
      },
      onDragOver({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
        return over
          ? `${active.id} is over ${over.id}.`
          : `${active.id} is no longer over a droppable area.`;
      },
      onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
        return over ? `Dropped ${active.id} onto ${over.id}.` : `Drop cancelled for ${active.id}.`;
      },
      onDragCancel({ active }: { active: { id: string | number } }) {
        return `Drag cancelled for ${active.id}.`;
      },
    }),
    [],
  );

  const handleDragStart = useCallback((ev: DragStartEvent) => {
    const ref = ev.active.data.current?.ref as NodeRef | undefined;
    if (ref) setActiveDrag(ref);
    setDropError(null);
  }, []);

  const computePosition = useCallback(
    (overRect: { top: number; height: number }, destKind: NodeRef["kind"]): DropPosition => {
      const y = pointerYRef.current;
      const ratio = (y - overRect.top) / Math.max(overRect.height, 1);
      // Books and notes can't contain children at the tree level, so an
      // "inside" gesture would reject or embed awkwardly — resolve purely to
      // before/after based on midpoint.
      if (destKind === "book" || destKind === "note") {
        return ratio < 0.5 ? "before" : "after";
      }
      // Chapters and notes-root support "inside" (nest / add-to-end).
      if (ratio < 0.35) return "before";
      if (ratio > 0.65) return "after";
      return "inside";
    },
    [],
  );

  const handleDragOver = useCallback(
    (ev: DragOverEvent) => {
      if (!ev.over) {
        setHoverInfo(null);
        return;
      }
      const dest = ev.over.data.current?.ref as NodeRef | undefined;
      if (!dest) {
        setHoverInfo(null);
        return;
      }
      const position: DropPosition =
        dest.kind === "notes-root"
          ? "inside"
          : computePosition({ top: ev.over.rect.top, height: ev.over.rect.height }, dest.kind);
      const nextId = String(ev.over.id);
      setHoverInfo((prev) => {
        if (prev && prev.overId === nextId && prev.position === position) return prev;
        return { overId: nextId, position };
      });
    },
    [computePosition],
  );

  const handleDragEnd = useCallback(
    async (ev: DragEndEvent) => {
      setActiveDrag(null);
      setHoverInfo(null);
      const source = ev.active.data.current?.ref as NodeRef | undefined;
      const dest = ev.over?.data.current?.ref as NodeRef | undefined;
      if (!source || !dest || !ev.over) return;

      const overRect = ev.over.rect;
      const position: DropPosition =
        dest.kind === "notes-root"
          ? "inside"
          : computePosition({ top: overRect.top, height: overRect.height }, dest.kind);

      setDropping(true);
      const outcome = await doDrop(source, dest, position);
      setDropping(false);
      if (!outcome.ok) setDropError(outcome.error);
    },
    [computePosition, doDrop],
  );

  // Track pointer Y across drags to resolve before/after/inside in handleDragEnd.
  useEffect(() => {
    if (!activeDrag) return;
    const onMove = (e: PointerEvent) => {
      pointerYRef.current = e.clientY;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [activeDrag]);

  // Close row menu on outside click / Escape.
  useEffect(() => {
    if (!menuFor) return;
    const handleDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="menu"]')) return;
      setMenuFor(null);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFor(null);
    };
    window.addEventListener("mousedown", handleDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [menuFor]);

  const runAction = useCallback(
    async (action: Promise<{ ok: boolean; error?: string }>) => {
      setMenuFor(null);
      const result = await action;
      if (!result.ok) setDropError(result.error ?? "Action failed");
    },
    [],
  );

  const promptCreateNote = useCallback(
    (parent: NodeRef) => {
      if (typeof window === "undefined") return;
      const title = window.prompt("Title for the new note?");
      if (!title) return;
      void runAction(treeActions.createScopedNote(parent, title));
    },
    [runAction, treeActions],
  );

  const buildMenu = useCallback(
    (ref: NodeRef): React.ReactNode => {
      if (ref.kind === "chapter") {
        return [
          <RowMenuButton
            key="create-note"
            label="Create note here"
            onClick={() => promptCreateNote(ref)}
          />,
          <RowMenuButton
            key="demote"
            label="Demote to note"
            onClick={() => void runAction(treeActions.demoteChapterToNote(ref))}
          />,
          <RowMenuButton
            key="delete"
            label="Delete"
            danger
            onClick={() => {
              if (typeof window === "undefined" || window.confirm("Delete this chapter?")) {
                void runAction(treeActions.remove(ref));
              }
            }}
          />,
        ];
      }
      if (ref.kind === "notes-root") {
        return (
          <RowMenuButton
            label="Create note here"
            onClick={() => promptCreateNote(ref)}
          />
        );
      }
      if (ref.kind === "note") {
        const firstBook = model.tree?.books[0];
        const items: React.ReactNode[] = [];
        if (firstBook) {
          items.push(
            <RowMenuButton
              key="promote"
              label={`Promote to chapter in "${firstBook.meta.title}"`}
              onClick={() =>
                void runAction(treeActions.promoteNoteToBook(ref, firstBook.meta.slug))
              }
            />,
          );
        }
        items.push(
          <RowMenuButton
            key="delete"
            label="Delete"
            danger
            onClick={() => {
              if (typeof window === "undefined" || window.confirm("Delete this note?")) {
                void runAction(treeActions.remove(ref));
              }
            }}
          />,
        );
        return items;
      }
      if (ref.kind === "book") {
        return [
          <RowMenuButton
            key="create-note"
            label="Create note here"
            onClick={() => promptCreateNote(ref)}
          />,
          <RowMenuButton
            key="delete"
            label="Delete"
            danger
            onClick={() => {
              if (
                typeof window === "undefined" ||
                window.confirm("Delete this book and all its chapters?")
              ) {
                void runAction(treeActions.remove(ref));
              }
            }}
          />,
        ];
      }
      return null;
    },
    [model.tree, promptCreateNote, runAction, treeActions],
  );

  const menuIdFor = menuFor ? refId(menuFor) : null;

  const hoverPositionFor = useCallback(
    (rowId: string): DropPosition | null =>
      hoverInfo && hoverInfo.overId === `drop:${rowId}` ? hoverInfo.position : null,
    [hoverInfo],
  );

  const dragPreview = useMemo(
    () => (activeDrag ? refLabel(activeDrag, model.tree) : null),
    [activeDrag, model.tree],
  );

  // Slice N: group scoped notes by their parent so we can render them under
  // the relevant book or chapter. Root notes stay in the bottom Notes section.
  const notesByLocation = useMemo(() => {
    const root: ContentTree["notes"] = [];
    const byBook = new Map<string, ContentTree["notes"]>();
    const byChapter = new Map<string, ContentTree["notes"]>();
    for (const note of model.tree?.notes ?? []) {
      if (note.location.kind === "root") {
        root.push(note);
      } else if (note.location.kind === "book") {
        const arr = byBook.get(note.location.bookSlug) ?? [];
        arr.push(note);
        byBook.set(note.location.bookSlug, arr);
      } else {
        const key = scopedChapterKey(
          note.location.bookSlug,
          note.location.chapterPath,
        );
        const arr = byChapter.get(key) ?? [];
        arr.push(note);
        byChapter.set(key, arr);
      }
    }
    return { root, byBook, byChapter };
  }, [model.tree]);

  if (!mounted || (model.loading && !model.tree)) {
    return (
      <div
        className="text-sm text-[var(--paper-muted)]"
        data-testid="content-tree-sidebar-loading"
      >
        Loading tree…
      </div>
    );
  }

  if (model.error) {
    return (
      <div
        className="rounded-[14px] border border-[var(--paper-danger)]/20 bg-[rgba(197,93,53,0.08)] px-3 py-2 text-sm text-[var(--paper-danger)]"
        role="alert"
      >
        <p>{model.error}</p>
        <button
          type="button"
          className="mt-1 text-xs underline"
          onClick={() => void model.refresh()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!model.tree) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <nav
        aria-label="Content tree"
        className={cn(
          "grid gap-0.5 text-sm",
          dropping && "pointer-events-none opacity-75",
        )}
        data-testid="content-tree-sidebar"
      >
        {dropError ? (
          <div
            className="rounded-[10px] border border-[var(--paper-danger)]/20 bg-[rgba(197,93,53,0.08)] px-2 py-1 text-xs text-[var(--paper-danger)]"
            role="alert"
          >
            {dropError}
          </div>
        ) : null}

        {model.tree.books.map((book) => {
          const key = nodeKey("book", book.meta.slug);
          const open = expanded[key] ?? true;
          const href = `/app/books/${book.meta.slug}`;
          const ref: NodeRef = { kind: "book", slug: book.meta.slug };
          const rowId = refId(ref);
          return (
            <div key={key}>
              <TreeRow
                id={rowId}
                ref_={ref}
                href={href}
                title={book.meta.title}
                icon={<BookMarked className="h-3.5 w-3.5 shrink-0 text-[var(--paper-muted)]" />}
                active={currentPath === href}
                menuOpen={menuIdFor === rowId}
                onMenuToggle={() => setMenuFor((prev) => (prev && refId(prev) === rowId ? null : ref))}
                menuContent={buildMenu(ref)}
                hoverPosition={hoverPositionFor(rowId)}
                chevron={
                  <button
                    type="button"
                    aria-label={open ? "Collapse" : "Expand"}
                    aria-expanded={open}
                    onClick={() => toggle(key, true)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-[rgba(73,57,38,0.08)]"
                  >
                    {open ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                }
              />
              {open ? (
                <div className="ml-6 grid gap-0.5 border-l border-[rgba(73,57,38,0.12)] pl-2">
                  {book.chapters.length ? (
                    <ChapterTreeRows
                      bookSlug={book.meta.slug}
                      chapters={book.chapters}
                      expanded={expanded}
                      toggle={toggle}
                      currentPath={currentPath}
                      menuIdFor={menuIdFor}
                      setMenuFor={setMenuFor}
                      buildMenu={buildMenu}
                      hoverPositionFor={hoverPositionFor}
                      notesByChapter={notesByLocation.byChapter}
                    />
                  ) : null}
                  <ScopedNotesGroup
                    notes={notesByLocation.byBook.get(book.meta.slug) ?? []}
                    currentPath={currentPath}
                    menuIdFor={menuIdFor}
                    setMenuFor={setMenuFor}
                    buildMenu={buildMenu}
                    hoverPositionFor={hoverPositionFor}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        <NotesSection
          notes={notesByLocation.root}
          currentPath={currentPath}
          menuIdFor={menuIdFor}
          setMenuFor={setMenuFor}
          buildMenu={buildMenu}
          hoverPositionFor={hoverPositionFor}
          hoverInfo={hoverInfo}
        />
      </nav>

      <DragOverlay dropAnimation={null}>
        {dragPreview ? (
          <div className="pointer-events-none rounded-[10px] border border-[rgba(73,57,38,0.2)] bg-[var(--paper-surface)] px-2 py-1 text-xs shadow-md">
            {dragPreview}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function TreeRow({
  id,
  ref_,
  href,
  title,
  icon,
  chevron,
  active,
  menuOpen,
  onMenuToggle,
  menuContent,
  hoverPosition,
}: {
  id: string;
  ref_: NodeRef;
  href: string;
  title: string;
  icon?: React.ReactNode;
  chevron?: React.ReactNode;
  active: boolean;
  menuOpen?: boolean;
  onMenuToggle?: () => void;
  menuContent?: React.ReactNode;
  hoverPosition?: DropPosition | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `drag:${id}`, data: { ref: ref_ } });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `drop:${id}`,
    data: { ref: ref_ },
  });

  return (
    <div
      ref={setDropRef}
      className={cn(
        "group relative flex items-center gap-1 rounded",
        hoverPosition === "inside" &&
          "bg-[rgba(73,57,38,0.08)] ring-1 ring-[rgba(73,57,38,0.3)]",
        isDragging && "opacity-40",
      )}
      onContextMenu={
        onMenuToggle
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onMenuToggle();
            }
          : undefined
      }
    >
      {hoverPosition === "before" ? (
        <span
          className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded-full bg-[var(--paper-accent,rgba(73,57,38,0.6))]"
          aria-hidden
        />
      ) : null}
      {hoverPosition === "after" ? (
        <span
          className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-[var(--paper-accent,rgba(73,57,38,0.6))]"
          aria-hidden
        />
      ) : null}
      {chevron ?? <span className="h-5 w-5 shrink-0" aria-hidden />}
      {icon}
      <div
        ref={setDragRef}
        {...listeners}
        {...attributes}
        className="min-w-0 flex-1 cursor-grab active:cursor-grabbing"
      >
        <Link
          href={href}
          className={cn(
            "block truncate rounded px-1 py-0.5 hover:bg-[rgba(73,57,38,0.06)]",
            active && "font-semibold",
          )}
        >
          {title}
        </Link>
      </div>
      {menuOpen && menuContent ? (
        <div
          role="menu"
          className="absolute left-4 top-full z-20 mt-1 grid min-w-[180px] max-w-[240px] gap-1 rounded-[12px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.98)] p-1 text-xs shadow-[0_18px_45px_rgba(47,34,21,0.16)]"
        >
          {menuContent}
        </div>
      ) : null}
    </div>
  );
}

function RowMenuButton({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-[rgba(73,57,38,0.08)] disabled:opacity-50",
        danger && "text-[var(--paper-danger)]",
      )}
    >
      {label}
    </button>
  );
}

function ChapterTreeRows({
  bookSlug,
  chapters,
  expanded,
  toggle,
  currentPath,
  menuIdFor,
  setMenuFor,
  buildMenu,
  hoverPositionFor,
  notesByChapter,
}: {
  bookSlug: string;
  chapters: ChapterTreeNode[];
  expanded: ExpandState;
  toggle: (key: string, defaultOpen: boolean) => void;
  currentPath?: string;
  menuIdFor: string | null;
  setMenuFor: React.Dispatch<React.SetStateAction<NodeRef | null>>;
  buildMenu: (ref: NodeRef) => React.ReactNode;
  hoverPositionFor: (rowId: string) => DropPosition | null;
  notesByChapter: Map<string, ContentTree["notes"]>;
}) {
  return (
    <>
      {chapters.map((chapter) => {
        const pathStr = chapter.path.join("/");
        const key = nodeKey("chapter", bookSlug, pathStr);
        const hasChildren = chapter.children.length > 0;
        const open = expanded[key] ?? false;
        const href = `/app/books/${bookSlug}/chapters/${pathStr}`;
        const ref: NodeRef = { kind: "chapter", bookSlug, chapterPath: chapter.path };
        const rowId = refId(ref);
        return (
          <div key={key}>
            <TreeRow
              id={rowId}
              ref_={ref}
              href={href}
              title={chapter.meta.title}
              active={currentPath === href}
              menuOpen={menuIdFor === rowId}
              onMenuToggle={() =>
                setMenuFor((prev) => (prev && refId(prev) === rowId ? null : ref))
              }
              menuContent={buildMenu(ref)}
              hoverPosition={hoverPositionFor(rowId)}
              chevron={
                hasChildren ? (
                  <button
                    type="button"
                    aria-label={open ? "Collapse" : "Expand"}
                    aria-expanded={open}
                    onClick={() => toggle(key, false)}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-[rgba(73,57,38,0.08)]"
                  >
                    {open ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                ) : undefined
              }
            />
            {open ? (
              <div className="ml-6 grid gap-0.5 border-l border-[rgba(73,57,38,0.12)] pl-2">
                {hasChildren ? (
                  <ChapterTreeRows
                    bookSlug={bookSlug}
                    chapters={chapter.children}
                    expanded={expanded}
                    toggle={toggle}
                    currentPath={currentPath}
                    menuIdFor={menuIdFor}
                    setMenuFor={setMenuFor}
                    buildMenu={buildMenu}
                    hoverPositionFor={hoverPositionFor}
                    notesByChapter={notesByChapter}
                  />
                ) : null}
                <ScopedNotesGroup
                  notes={notesByChapter.get(scopedChapterKey(bookSlug, chapter.path)) ?? []}
                  currentPath={currentPath}
                  menuIdFor={menuIdFor}
                  setMenuFor={setMenuFor}
                  buildMenu={buildMenu}
                  hoverPositionFor={hoverPositionFor}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function ScopedNotesGroup({
  notes,
  currentPath,
  menuIdFor,
  setMenuFor,
  buildMenu,
  hoverPositionFor,
}: {
  notes: ContentTree["notes"];
  currentPath?: string;
  menuIdFor: string | null;
  setMenuFor: React.Dispatch<React.SetStateAction<NodeRef | null>>;
  buildMenu: (ref: NodeRef) => React.ReactNode;
  hoverPositionFor: (rowId: string) => DropPosition | null;
}) {
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((note) => {
        const ref: NodeRef = { kind: "note", slug: note.meta.slug };
        const rowId = refId(ref);
        const href = `/app${note.route}`;
        return (
          <TreeRow
            key={`scoped:${note.meta.slug}`}
            id={rowId}
            ref_={ref}
            href={href}
            title={note.meta.title}
            active={currentPath === href}
            menuOpen={menuIdFor === rowId}
            onMenuToggle={() =>
              setMenuFor((prev) => (prev && refId(prev) === rowId ? null : ref))
            }
            menuContent={buildMenu(ref)}
            hoverPosition={hoverPositionFor(rowId)}
          />
        );
      })}
    </>
  );
}

function NotesSection({
  notes,
  currentPath,
  menuIdFor,
  setMenuFor,
  buildMenu,
  hoverPositionFor,
  hoverInfo,
}: {
  notes: ContentTree["notes"];
  currentPath?: string;
  menuIdFor: string | null;
  setMenuFor: React.Dispatch<React.SetStateAction<NodeRef | null>>;
  buildMenu: (ref: NodeRef) => React.ReactNode;
  hoverPositionFor: (rowId: string) => DropPosition | null;
  hoverInfo: { overId: string; position: DropPosition } | null;
}) {
  const { setNodeRef } = useDroppable({
    id: "drop:notes-root",
    data: { ref: { kind: "notes-root" } satisfies NodeRef },
  });
  const notesRootHovered = hoverInfo?.overId === "drop:notes-root";
  const rootRef: NodeRef = { kind: "notes-root" };
  const rootRowId = refId(rootRef);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative mt-3 grid gap-0.5 rounded p-1",
        notesRootHovered && "bg-[rgba(73,57,38,0.08)] ring-1 ring-[rgba(73,57,38,0.3)]",
      )}
      data-testid="notes-drop-zone"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuFor((prev) => (prev && refId(prev) === rootRowId ? null : rootRef));
      }}
    >
      <div className="flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--paper-muted)]">
        <FileText className="h-3 w-3" /> Notes
      </div>
      {menuIdFor === rootRowId ? (
        <div
          role="menu"
          className="absolute left-2 top-6 z-20 grid min-w-[180px] max-w-[240px] gap-1 rounded-[12px] border border-[var(--paper-border)] bg-[rgba(255,250,240,0.98)] p-1 text-xs shadow-[0_18px_45px_rgba(47,34,21,0.16)]"
        >
          {buildMenu(rootRef)}
        </div>
      ) : null}
      {notes.map((note) => {
        const href = `/app/notes/${note.meta.slug}`;
        const ref: NodeRef = { kind: "note", slug: note.meta.slug };
        const rowId = refId(ref);
        return (
          <TreeRow
            key={note.meta.slug}
            id={rowId}
            ref_={ref}
            href={href}
            title={note.meta.title}
            active={currentPath === href}
            menuOpen={menuIdFor === rowId}
            onMenuToggle={() =>
              setMenuFor((prev) => (prev && refId(prev) === rowId ? null : ref))
            }
            menuContent={buildMenu(ref)}
            hoverPosition={hoverPositionFor(rowId)}
          />
        );
      })}
    </div>
  );
}
