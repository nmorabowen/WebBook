"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultEditorShortcuts,
  editorShortcutDefinitions,
  loadEditorShortcuts,
  resetEditorShortcuts,
  saveEditorShortcuts,
  shortcutFromKeyboardEvent,
  type EditorShortcutMap,
  type ShortcutActionId,
} from "@/lib/editor-shortcuts";

type ShortcutsSettingsPanelProps = {
  scopeKey: string;
};

function shortcutDisplay(shortcut: string) {
  return shortcut || "Unassigned";
}

export function ShortcutsSettingsPanel({
  scopeKey,
}: ShortcutsSettingsPanelProps) {
  const [shortcutMap, setShortcutMap] = useState<EditorShortcutMap>(() =>
    loadEditorShortcuts(scopeKey),
  );
  const [savedShortcutMap, setSavedShortcutMap] = useState<EditorShortcutMap>(() =>
    loadEditorShortcuts(scopeKey),
  );
  const [recordingAction, setRecordingAction] = useState<ShortcutActionId | null>(
    null,
  );
  const [message, setMessage] = useState(
    "These shortcuts apply to the markdown source editor.",
  );

  useEffect(() => {
    if (!recordingAction) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRecordingAction(null);
        setMessage("Shortcut capture cancelled.");
        return;
      }

      const combo = shortcutFromKeyboardEvent(event);
      if (!combo) {
        return;
      }

      event.preventDefault();

      const conflictingDefinition = editorShortcutDefinitions.find(
        (definition) =>
          definition.id !== recordingAction &&
          shortcutMap[definition.id] === combo,
      );

      if (conflictingDefinition) {
        setMessage(
          `${combo} is already assigned to ${conflictingDefinition.label}. Choose a different shortcut.`,
        );
        return;
      }

      setShortcutMap((current) => ({
        ...current,
        [recordingAction]: combo,
      }));
      setRecordingAction(null);
      setMessage(`Assigned ${combo} to ${
        editorShortcutDefinitions.find((definition) => definition.id === recordingAction)
          ?.label ?? "shortcut"
      }.`);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [recordingAction, shortcutMap]);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(shortcutMap) !== JSON.stringify(savedShortcutMap),
    [savedShortcutMap, shortcutMap],
  );

  const saveShortcuts = () => {
    saveEditorShortcuts(scopeKey, shortcutMap);
    setSavedShortcutMap(shortcutMap);
    setRecordingAction(null);
    setMessage("Shortcuts saved.");
  };

  const restoreDefaults = () => {
    resetEditorShortcuts(scopeKey);
    setShortcutMap(defaultEditorShortcuts);
    setSavedShortcutMap(defaultEditorShortcuts);
    setRecordingAction(null);
    setMessage("Restored default shortcuts.");
  };

  return (
    <div className="grid gap-6">
      <section className="dashboard-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <p className="paper-label">Markdown editor shortcuts</p>
            <p className="max-w-3xl text-sm leading-7 text-[var(--paper-muted)]">
              Map the main formatting actions to the keyboard shortcuts you use most often.
              Default image insertion uses <span className="font-semibold">Ctrl+Shift+I</span>{" "}
              so <span className="font-semibold">Ctrl+I</span> can stay reserved for italic.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="paper-button paper-button-secondary"
              onClick={restoreDefaults}
            >
              Restore defaults
            </button>
            <button
              type="button"
              className="paper-button"
              onClick={saveShortcuts}
              disabled={!hasUnsavedChanges}
            >
              Save shortcuts
            </button>
          </div>
        </div>
        <p className="mt-4 text-sm text-[var(--paper-muted)]">{message}</p>
      </section>

      <section className="grid gap-3">
        {editorShortcutDefinitions.map((definition) => {
          const isRecording = recordingAction === definition.id;
          return (
            <div
              key={definition.id}
              className="dashboard-card grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_170px_auto]"
            >
              <div className="grid gap-1">
                <p className="text-base font-semibold text-[var(--paper-ink)]">
                  {definition.label}
                </p>
                <p className="text-sm leading-7 text-[var(--paper-muted)]">
                  {definition.description}
                </p>
              </div>
              <div className="flex items-center">
                <span className="paper-badge px-3 py-2 text-sm">
                  {isRecording
                    ? "Press keys..."
                    : shortcutDisplay(shortcutMap[definition.id])}
                </span>
              </div>
              <div className="flex items-center justify-start md:justify-end">
                <button
                  type="button"
                  className="paper-button paper-button-secondary"
                  onClick={() => {
                    const nextAction =
                      recordingAction === definition.id ? null : definition.id;
                    setRecordingAction(nextAction);
                    setMessage(
                      nextAction
                        ? `Recording a shortcut for ${definition.label}. Press Escape to cancel.`
                        : "Shortcut capture cancelled.",
                    );
                  }}
                >
                  {isRecording ? "Cancel" : "Record"}
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
