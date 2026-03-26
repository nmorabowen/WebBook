import { NextResponse } from "next/server";

/**
 * Returns a JSON error response with a consistent `{ error: string }` shape.
 *
 * Usage:
 *   return apiError(404, "Not found");
 *   return apiError(400, error, "Book creation failed");
 */
export function apiError(
  status: number,
  errorOrMessage: unknown,
  fallback?: string,
): NextResponse {
  const message =
    errorOrMessage instanceof Error
      ? errorOrMessage.message
      : typeof errorOrMessage === "string"
        ? errorOrMessage
        : (fallback ?? "An unexpected error occurred");

  return NextResponse.json({ error: message }, { status });
}
