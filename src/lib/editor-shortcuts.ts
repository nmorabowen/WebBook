export type ShortcutActionId =
  | "bold"
  | "italic"
  | "inlineMath"
  | "blockMath"
  | "image"
  | "undo"
  | "redo";

export type EditorShortcutMap = Record<ShortcutActionId, string>;

export type EditorShortcutDefinition = {
  id: ShortcutActionId;
  label: string;
  description: string;
  defaultShortcut: string;
};

export const EDITOR_SHORTCUTS_UPDATED_EVENT = "webbook:editor-shortcuts-updated";

export const editorShortcutDefinitions: EditorShortcutDefinition[] = [
  {
    id: "bold",
    label: "Bold",
    description: "Wraps the current selection in markdown bold markers.",
    defaultShortcut: "Ctrl+B",
  },
  {
    id: "italic",
    label: "Italic",
    description: "Wraps the current selection in markdown italic markers.",
    defaultShortcut: "Ctrl+I",
  },
  {
    id: "inlineMath",
    label: "Inline math",
    description: "Wraps the current selection in inline MathJax delimiters.",
    defaultShortcut: "Ctrl+E",
  },
  {
    id: "blockMath",
    label: "Block math",
    description: "Inserts a display-math block around the selection.",
    defaultShortcut: "Ctrl+Shift+E",
  },
  {
    id: "image",
    label: "Insert image",
    description: "Opens the image picker for markdown image insertion.",
    defaultShortcut: "Ctrl+Shift+I",
  },
  {
    id: "undo",
    label: "Undo",
    description: "Restores the previous markdown editor snapshot.",
    defaultShortcut: "Ctrl+Z",
  },
  {
    id: "redo",
    label: "Redo",
    description: "Reapplies the next markdown editor snapshot.",
    defaultShortcut: "Ctrl+Y",
  },
];

export const defaultEditorShortcuts = Object.fromEntries(
  editorShortcutDefinitions.map((definition) => [
    definition.id,
    definition.defaultShortcut,
  ]),
) as EditorShortcutMap;

export function getEditorShortcutStorageKey(scopeKey: string) {
  return `webbook.editor-shortcuts.${scopeKey}`;
}

export function isShortcutActionId(value: string): value is ShortcutActionId {
  return editorShortcutDefinitions.some((definition) => definition.id === value);
}

function normalizeShortcutMap(value: unknown): EditorShortcutMap {
  if (!value || typeof value !== "object") {
    return defaultEditorShortcuts;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [ShortcutActionId, string] =>
      isShortcutActionId(entry[0]) && typeof entry[1] === "string" && entry[1].trim().length > 0,
  );

  return {
    ...defaultEditorShortcuts,
    ...Object.fromEntries(entries.map(([id, shortcut]) => [id, shortcut.trim()])),
  };
}

export function loadEditorShortcuts(scopeKey: string) {
  if (typeof window === "undefined") {
    return defaultEditorShortcuts;
  }

  try {
    const raw = window.localStorage.getItem(getEditorShortcutStorageKey(scopeKey));
    if (!raw) {
      return defaultEditorShortcuts;
    }

    return normalizeShortcutMap(JSON.parse(raw));
  } catch {
    return defaultEditorShortcuts;
  }
}

export function saveEditorShortcuts(
  scopeKey: string,
  shortcutMap: EditorShortcutMap,
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeShortcutMap(shortcutMap);
  window.localStorage.setItem(
    getEditorShortcutStorageKey(scopeKey),
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent<EditorShortcutMap>(EDITOR_SHORTCUTS_UPDATED_EVENT, {
      detail: normalized,
    }),
  );
}

export function resetEditorShortcuts(scopeKey: string) {
  saveEditorShortcuts(scopeKey, defaultEditorShortcuts);
}

function normalizeShortcutKey(key: string) {
  if (!key) {
    return null;
  }

  if (key === " ") {
    return "Space";
  }

  const normalized = key.length === 1 ? key.toUpperCase() : key;
  const lower = normalized.toLowerCase();

  if (lower === "control" || lower === "meta" || lower === "shift" || lower === "alt") {
    return null;
  }

  if (lower === "escape") {
    return "Escape";
  }

  if (lower === "backspace") {
    return "Backspace";
  }

  if (lower === "delete") {
    return "Delete";
  }

  if (lower === "enter") {
    return "Enter";
  }

  if (normalized.length === 1) {
    return normalized;
  }

  return normalized[0].toUpperCase() + normalized.slice(1);
}

export function shortcutFromKeyboardEvent(
  event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "key">,
) {
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  const key = normalizeShortcutKey(event.key);

  if (!hasPrimaryModifier || !key) {
    return null;
  }

  const modifiers = ["Ctrl"];
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }

  return [...modifiers, key].join("+");
}
