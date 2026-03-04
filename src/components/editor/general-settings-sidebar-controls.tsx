"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Download, LayoutGrid, Save, Upload } from "lucide-react";
import {
  GENERAL_SETTINGS_SAVE_EVENT,
  GENERAL_SETTINGS_SAVE_STATUS_EVENT,
  type GeneralSettingsSaveStatus,
} from "@/lib/general-settings-events";

export function GeneralSettingsSidebarControls() {
  const [status, setStatus] = useState<GeneralSettingsSaveStatus>("idle");
  const [isExporting, startExportTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const [transferMessage, setTransferMessage] = useState(
    "Export the full workspace or restore it from a previous WebBook archive.",
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const exportWorkspace = () => {
    startExportTransition(async () => {
      setTransferMessage("Preparing workspace export...");
      const response = await fetch("/api/settings/general/export", {
        method: "GET",
      });

      const payload = !response.ok
        ? ((await response.json().catch(() => null)) as { error?: string } | null)
        : null;

      if (!response.ok) {
        setTransferMessage(payload?.error ?? "Could not export the workspace.");
        return;
      }

      const archive = await response.blob();
      const downloadUrl = window.URL.createObjectURL(archive);
      const link = document.createElement("a");
      const contentDisposition = response.headers.get("content-disposition");
      const fileNameMatch = contentDisposition?.match(/filename="([^"]+)"/i);

      link.href = downloadUrl;
      link.download = fileNameMatch?.[1] ?? "webbook-workspace.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setTransferMessage("Workspace export downloaded.");
    });
  };

  const importWorkspace = (file: File) => {
    startImportTransition(async () => {
      setTransferMessage("Importing workspace archive...");
      const formData = new FormData();
      formData.append("archive", file);

      const response = await fetch("/api/settings/general/import", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setTransferMessage(
          payload?.error ?? "Could not import the workspace archive.",
        );
        return;
      }

      setTransferMessage("Workspace imported. Reloading...");
      window.location.reload();
    });
  };

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
      <div className="grid gap-3 rounded-[22px] border border-[var(--paper-border)] bg-[rgba(255,255,255,0.52)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--paper-muted)]">
          <Download className="h-4 w-4" />
          Workspace transfer
        </div>
        <p className="text-sm leading-7 text-[var(--paper-muted)]">
          Export books, notes, uploads, users, revisions, and settings as a single zip file, or restore a previous workspace archive.
        </p>
        <div className="grid gap-3">
          <button
            type="button"
            className="paper-button"
            disabled={isExporting || isImporting}
            onClick={exportWorkspace}
          >
            <Download className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export workspace"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                importWorkspace(file);
              }
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="paper-button"
            disabled={isExporting || isImporting}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {isImporting ? "Importing..." : "Import workspace"}
          </button>
        </div>
        <p className="text-sm leading-7 text-[var(--paper-muted)]">{transferMessage}</p>
      </div>
    </div>
  );
}
