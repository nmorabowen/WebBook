"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordWorkspaceDebugEvent } from "@/lib/workspace-debug";

function stringifyUnknown(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Unserializable rejection reason";
  }
}

function describeElement(element: HTMLElement) {
  const href =
    element instanceof HTMLAnchorElement ? element.getAttribute("href") : null;
  const action =
    element instanceof HTMLButtonElement
      ? element.type === "submit"
        ? "Submit button"
        : "Button"
      : element instanceof HTMLAnchorElement
        ? "Link"
        : "Control";
  const label =
    element.getAttribute("aria-label") ??
    element.getAttribute("title") ??
    element.textContent ??
    element.getAttribute("name") ??
    element.getAttribute("id") ??
    action;

  const cleanLabel = label.trim().replace(/\s+/g, " ").slice(0, 100);
  const detailParts = [
    href ? `href=${href}` : null,
    element instanceof HTMLButtonElement ? `type=${element.type}` : null,
    element.getAttribute("data-testid")
      ? `testid=${element.getAttribute("data-testid")}`
      : null,
  ].filter(Boolean);

  return {
    message: `${action}: ${cleanLabel || "unnamed control"}`,
    detail: detailParts.join(" | ") || null,
  };
}

function describeRequest(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const request =
      input instanceof Request
        ? input
        : new Request(
            typeof input === "string" || input instanceof URL
              ? input.toString()
              : input,
            init,
          );
    const url = new URL(request.url, window.location.origin);
    const method = (init?.method ?? request.method ?? "GET").toUpperCase();

    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return null;
    }

    if (url.pathname.startsWith("/api/error-logs")) {
      return null;
    }

    return {
      method,
      path: `${url.pathname}${url.search}`,
    };
  } catch {
    return null;
  }
}

export function WorkspaceDebugRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    recordWorkspaceDebugEvent({
      category: "navigation",
      message: `Route: ${pathname}`,
      detail: document.title || null,
    });
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              "a, button, [role='button'], input[type='button'], input[type='submit'], summary",
            )
          : null;
      if (!target) {
        return;
      }

      const entry = describeElement(target);
      recordWorkspaceDebugEvent({
        category: "action",
        message: entry.message,
        detail: entry.detail,
      });
    };

    const handleSubmit = (event: SubmitEvent) => {
      const form =
        event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) {
        return;
      }

      const action = form.getAttribute("action") || pathname;
      const method = (form.getAttribute("method") || "GET").toUpperCase();

      recordWorkspaceDebugEvent({
        category: "action",
        message: `Form submit: ${method} ${action}`,
        detail: form.getAttribute("aria-label") || null,
      });
    };

    const handleRuntimeError = (event: ErrorEvent) => {
      const detailParts = [
        event.filename ? `file=${event.filename}` : null,
        event.lineno ? `line=${event.lineno}` : null,
        event.colno ? `column=${event.colno}` : null,
      ].filter(Boolean);

      recordWorkspaceDebugEvent({
        level: "error",
        category: "runtime",
        message: event.message || "Unhandled window error",
        detail:
          event.error instanceof Error
            ? event.error.stack ?? event.error.message
            : detailParts.join(" | ") || null,
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.stack ?? event.reason.message
          : stringifyUnknown(event.reason);

      recordWorkspaceDebugEvent({
        level: "error",
        category: "runtime",
        message: "Unhandled promise rejection",
        detail: reason,
      });
    };

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const request = describeRequest(input, init);
      const isMutationRequest =
        request &&
        ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);

      if (request && isMutationRequest) {
        recordWorkspaceDebugEvent({
          category: "network",
          message: `${request.method} ${request.path}`,
          detail: "Request started",
        });
      }

      try {
        const response = await originalFetch(input, init);

        if (request && (!response.ok || isMutationRequest)) {
          recordWorkspaceDebugEvent({
            level: response.ok ? "info" : "error",
            category: "network",
            message: `${request.method} ${request.path}`,
            detail: `Response ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
          });
        }

        return response;
      } catch (error) {
        if (request) {
          recordWorkspaceDebugEvent({
            level: "error",
            category: "network",
            message: `${request.method} ${request.path}`,
            detail:
              error instanceof Error ? error.message : "Request threw before completing",
          });
        }

        throw error;
      }
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [pathname]);

  return null;
}
