"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AnalyticsSettingsPanelProps = {
  initialMeasurementId: string;
  canEdit: boolean;
};

const GA_MEASUREMENT_ID_PATTERN = /^$|^G-[A-Za-z0-9]+$/;

export function AnalyticsSettingsPanel({
  initialMeasurementId,
  canEdit,
}: AnalyticsSettingsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [measurementId, setMeasurementId] = useState(initialMeasurementId);
  const [message, setMessage] = useState(
    canEdit
      ? "Save a GA4 measurement ID here to update analytics from the workspace."
      : "Only admins can change the measurement ID.",
  );
  const normalizedMeasurementId = measurementId.trim();
  const isValid = GA_MEASUREMENT_ID_PATTERN.test(normalizedMeasurementId);

  const save = () => {
    if (!canEdit || !isValid) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/settings/general", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          analyticsMeasurementId: normalizedMeasurementId,
        }),
      });

      if (!response.ok) {
        setMessage("Could not save the analytics measurement ID.");
        return;
      }

      setMeasurementId(normalizedMeasurementId);
      setMessage(
        normalizedMeasurementId
          ? "Analytics measurement ID saved."
          : "Analytics measurement ID cleared.",
      );
      router.refresh();
    });
  };

  return (
    <section
      className="border border-[var(--paper-border)] bg-[rgba(255,255,255,0.58)] p-6"
      style={{ borderRadius: "var(--workspace-corner-radius)" }}
    >
      <div className="grid gap-3">
        <div>
          <p className="paper-label">GA4 setup</p>
          <h2 className="text-2xl font-semibold">Measurement ID</h2>
        </div>
        <p className="max-w-3xl text-sm leading-7 text-[var(--paper-muted)]">
          Enter the Google Analytics 4 measurement ID here instead of editing environment
          files. Use a value like <code>G-XXXXXXXXXX</code>, or clear the field to disable
          analytics.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <label className="paper-label" htmlFor="analytics-measurement-id">
            Measurement ID
          </label>
          <input
            id="analytics-measurement-id"
            type="text"
            className="paper-input mt-2"
            value={measurementId}
            onChange={(event) => setMeasurementId(event.target.value.toUpperCase())}
            placeholder="G-XXXXXXXXXX"
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
            disabled={!canEdit || isPending}
            aria-invalid={!isValid}
          />
          <p className="mt-2 text-sm text-[var(--paper-muted)]">
            {isValid
              ? "Blank disables analytics. Any saved change takes effect on the next page load."
              : "Use a GA4 web measurement ID like G-XXXXXXXXXX."}
          </p>
        </div>

        {canEdit ? (
          <button
            type="button"
            className="paper-button"
            onClick={save}
            disabled={isPending || !isValid}
          >
            {isPending ? "Saving" : "Save analytics"}
          </button>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-[var(--paper-muted)]">{message}</p>
    </section>
  );
}
