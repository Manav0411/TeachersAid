import { NextResponse } from "next/server";
import { ModelJsonError } from "@/lib/ai/json";
import type { ApiError } from "@/lib/schemas";

/** Shared by every API route: map a caught error to the typed envelope. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ModelJsonError) {
    return { code: "invalid_model_output", message: err.message, retryable: true };
  }
  // @google/genai errors carry `status`; the `ai` SDK's APICallError
  // (lib/ai/groq.ts) carries `statusCode` instead.
  const e = err as { status?: number; statusCode?: number };
  const status = e?.status ?? e?.statusCode;
  if (status === 429) {
    return { code: "rate_limited", message: "Rate limited by the model", retryable: true };
  }
  return {
    code: "model_error",
    message: err instanceof Error ? err.message : "Unknown error",
    retryable: false,
  };
}

export function errorResponse(error: ApiError) {
  const status = error.code === "invalid_request" ? 400 : 502;
  return NextResponse.json({ ok: false, error }, { status });
}

export function okResponse<T>(data: T) {
  return NextResponse.json({ ok: true, data });
}
