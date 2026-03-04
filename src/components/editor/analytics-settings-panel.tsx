"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type AnalyticsSettingsPanelProps = {
  initialMeasurementId: string;
  initialGtmContainerId: string;
  canEdit: boolean;
};

const GA_MEASUREMENT_ID_PATTERN = /^$|^G-[A-Za-z0-9]+$/;
const GTM_CONTAINER_ID_PATTERN = /^$|^GTM-[A-Z0-9]+$/;

export function AnalyticsSettingsPanel({
  initialMeasurementId,
  initialGtmContainerId,
  canEdit,
}: AnalyticsSettingsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [measurementId, setMeasurementId] = useState(initialMeasurementId);
  const [gtmContainerId, setGtmContainerId] = useState(initialGtmContainerId);
  const [message, setMessage] = useState(
    canEdit
      ? "Save a GTM container ID or GA4 measurement ID here to update analytics from the workspace."
      : "Only admins can change analytics identifiers.",
  );
  const normalizedMeasurementId = measurementId.trim();
  const normalizedGtmContainerId = gtmContainerId.trim();
  const isValid = GA_MEASUREMENT_ID_PATTERN.test(normalizedMeasurementId);
  const isGtmValid = GTM_CONTAINER_ID_PATTERN.test(normalizedGtmContainerId);

  const save = () => {
    if (!canEdit || !isValid || !isGtmValid) {
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
          analyticsGtmContainerId: normalizedGtmContainerId,
        }),
      });

      if (!response.ok) {
        setMessage("Could not save the analytics settings.");
        return;
      }

      setMeasurementId(normalizedMeasurementId);
      setGtmContainerId(normalizedGtmContainerId);
      setMessage(
        normalizedGtmContainerId
          ? "Google Tag Manager container saved. It will be used in preference to GA4 direct tracking."
          : normalizedMeasurementId
            ? "GA4 measurement ID saved."
            : "Analytics identifiers cleared.",
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
          <p className="paper-label">Analytics setup</p>
          <h2 className="text-2xl font-semibold">Identifiers</h2>
        </div>
        <p className="max-w-3xl text-sm leading-7 text-[var(--paper-muted)]">
          Enter either a Google Tag Manager container ID like <code>GTM-MRNSLL2K</code>
          or a direct Google Analytics 4 measurement ID like <code>G-XXXXXXXXXX</code>.
          If both are set, WebBook loads GTM and leaves GA4 to your container configuration.
        </p>
      </div>

      <div className="mt-4 grid gap-4">
        <div>
          <label className="paper-label" htmlFor="analytics-gtm-container-id">
            GTM container ID
          </label>
          <input
            id="analytics-gtm-container-id"
            type="text"
            className="paper-input mt-2"
            value={gtmContainerId}
            onChange={(event) => setGtmContainerId(event.target.value.toUpperCase())}
            placeholder="GTM-MRNSLL2K"
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
            disabled={!canEdit || isPending}
            aria-invalid={!isGtmValid}
          />
          <p className="mt-2 text-sm text-[var(--paper-muted)]">
            {isGtmValid
              ? "Recommended if you already created a Tag Manager container."
              : "Use a GTM container ID like GTM-MRNSLL2K."}
          </p>
        </div>

        <div>
          <label className="paper-label" htmlFor="analytics-measurement-id">
            GA4 measurement ID
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
              ? "Optional fallback if you are not using GTM."
              : "Use a GA4 web measurement ID like G-XXXXXXXXXX."}
          </p>
        </div>

        {canEdit ? (
          <button
            type="button"
            className="paper-button"
            onClick={save}
            disabled={isPending || !isValid || !isGtmValid}
          >
            {isPending ? "Saving" : "Save analytics"}
          </button>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-[var(--paper-muted)]">{message}</p>
    </section>
  );
}
