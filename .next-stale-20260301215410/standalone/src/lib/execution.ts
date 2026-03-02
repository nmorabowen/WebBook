import { createHash } from "crypto";
import { env } from "@/lib/env";

export type ExecutePythonRequest = {
  cellId: string;
  source: string;
  pageId: string;
  requester: "admin" | "public";
  requestKey: string;
};

export type ExecutePythonResponse = {
  ok: boolean;
  stdout: string;
  stderr: string;
  artifacts: Array<{
    kind: "image/png";
    base64: string;
  }>;
  durationMs: number;
  cached: boolean;
};

export function createRequestKey(input: {
  cellId: string;
  source: string;
  pageId: string;
}) {
  return createHash("sha256")
    .update(`${input.pageId}:${input.cellId}:${input.source}`)
    .digest("hex");
}

export async function executePython(
  input: Omit<ExecutePythonRequest, "requestKey"> & { requestKey?: string },
) {
  const payload: ExecutePythonRequest = {
    ...input,
    requestKey:
      input.requestKey ??
      createRequestKey({
        cellId: input.cellId,
        pageId: input.pageId,
        source: input.source,
      }),
  };

  const response = await fetch(env.pythonRunnerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Python runner failed with ${response.status}`);
  }

  return (await response.json()) as ExecutePythonResponse;
}
