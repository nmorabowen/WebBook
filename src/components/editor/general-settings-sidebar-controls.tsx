"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Save } from "lucide-react";
import {
  GENERAL_SETTINGS_SAVE_EVENT,
  GENERAL_SETTINGS_SAVE_STATUS_EVENT,
  type GeneralSettingsSaveStatus,
} from "@/lib/general-settings-events";

export function GeneralSettingsSidebarControls() {
  const [status, setStatus] = useState<GeneralSettingsSaveStatus>("idle");

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const nextStatus = (event as CustomEvent<GeneralSettingsSaveStatus>).detail;
      setStatus(nextStatus);
    };

    window.addEventListener(GENERAL_SETTINGS_SAVE_STATUS_EVENT, handleStatus);
    return () => {
      window.removeEventListener(
        GENERAL_SETTINGS_SAVE_STATUS_EVENT,
        handleStatus,
      );
    };
  }, []);

  const statusLabel =
    status === "saving"
      ? "Saving"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? "Retry needed"
          : "Workspace";

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--paper-accent-soft)] text-[var(--paper-accent)]">
          <Save className="h-5 w-5" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="paper-label">Workspace controls</p>
            <p className="text-sm leading-7 text-[var(--paper-muted)]">
              These values affect the authoring dashboard shell, including tile spacing and panel curvature.
            </p>
          </div>
          <span className="paper-badge">{statusLabel}</span>
        </div>
        <button
          type="button"
          className="paper-button"
          disabled={status === "saving"}
          onClick={() =>
            window.dispatchEvent(new CustomEvent(GENERAL_SETTINGS_SAVE_EVENT))
          }
        >
          {status === "saving" ? "Saving..." : "Save settings"}
        </button>
      </div>
      <div className="rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
          <LayoutGrid className="h-4 w-4" />
          Live scope
        </div>
        <p className="mt-2 text-sm leading-7 text-[var(--paper-muted)]">
          Changes apply to the authoring workspace after save and refresh the active dashboard layout immediately.
        </p>
      </div>
    </div>
  );
}
