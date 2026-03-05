import type { ContentTree } from "@/lib/content/schemas";

export type WorkspaceCommandKind = "book" | "note" | "chapter";

export type WorkspaceCommand = {
  id: string;
  label: string;
  kind: WorkspaceCommandKind;
  context: string;
  keywords: string;
  run: () => unknown | Promise<unknown>;
  disabledReason?: string;
};

export type WorkspaceChapterMoveRequest = {
  bookSlug: string;
  chapterPath: string[];
  chapterTitle: string;
};

export type OrganizerNodeRef =
  | { kind: "book"; slug: string }
  | { kind: "note"; slug: string }
  | { kind: "chapter"; bookSlug: string; chapterPath: string[] };

export type OrganizerSelection = {
  ref: OrganizerNodeRef;
  id: string;
  title: string;
  subtitle: string;
  kind: OrganizerNodeRef["kind"];
};

export type OrganizerDestination = {
  bookSlug: string;
  parentChapterPath: string[];
  order?: number;
};

export type OrganizerDraftAction =
  | {
      type: "create-book";
      title: string;
    }
  | {
      type: "create-note";
      title: string;
    }
  | {
      type: "create-chapter";
      bookSlug: string;
      parentChapterPath: string[];
      title: string;
      order?: number;
    };

export type WorkspaceTreeSnapshot = Pick<ContentTree, "books" | "notes">;
