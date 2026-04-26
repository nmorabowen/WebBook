import type { HTMLAttributeAnchorTarget, ReactNode } from "react";
import type { SeafileShareInfo } from "@/lib/utils";

type SeafileLinkCardProps = {
  info: SeafileShareInfo;
  label?: ReactNode;
  target?: HTMLAttributeAnchorTarget;
  rel?: string;
};

function FileGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
    >
      <path
        d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
    >
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
    >
      <path
        d="M13 5h6v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 5 11 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SeafileLinkCard({ info, label, target, rel }: SeafileLinkCardProps) {
  const title =
    info.name ??
    (typeof label === "string" && label && label !== info.url ? label : null) ??
    (info.kind === "file" ? "Seafile share" : "Seafile library");

  const subtitle =
    info.kind === "file"
      ? `Shared file · ${info.host}`
      : `Shared library · ${info.host}`;

  return (
    <a
      className="seafile-link-card"
      href={info.url}
      target={target}
      rel={rel}
      data-seafile-kind={info.kind}
    >
      <span className="seafile-link-card-icon" aria-hidden="true">
        {info.kind === "file" ? <FileGlyph /> : <FolderGlyph />}
      </span>
      <span className="seafile-link-card-body">
        <span className="seafile-link-card-title">{title}</span>
        <span className="seafile-link-card-subtitle">{subtitle}</span>
      </span>
      <span className="seafile-link-card-action" aria-hidden="true">
        <ExternalGlyph />
      </span>
    </a>
  );
}
