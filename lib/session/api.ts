import type { ApiError } from "@/lib/schemas";

export class ApiCallError extends Error {
  retryable: boolean;
  status?: number;
  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = "ApiCallError";
    this.retryable = error.retryable;
    this.status = status;
  }
}

/** POSTs to one of this app's own API routes and unwraps the {ok,data|error} envelope. */
export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json()) as { ok: true; data: T } | { ok: false; error: ApiError };
  if (!json.ok) {
    throw new ApiCallError(json.error, res.status);
  }
  return json.data;
}
