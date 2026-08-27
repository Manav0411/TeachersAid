import { generateGraded } from "@/lib/ai/groq";
import { withRetry } from "@/lib/pool";
import { buildGradingPrompt } from "@/lib/prompts/grading";
import { GradeModelResponse, GradeRequest } from "@/lib/schemas";
import { errorResponse, okResponse, toApiError } from "@/lib/ai/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Grades in small batches (≤5 items), text only — no images needed here. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: "invalid_request", message: "Request body must be JSON", retryable: false });
  }

  const parsedReq = GradeRequest.safeParse(body);
  if (!parsedReq.success) {
    return errorResponse({ code: "invalid_request", message: parsedReq.error.message, retryable: false });
  }

  if (parsedReq.data.items.length === 0) {
    return okResponse({ grades: [] });
  }

  try {
    const data = await withRetry(() =>
      generateGraded(buildGradingPrompt(parsedReq.data.items), GradeModelResponse)
    );
    return okResponse(data);
  } catch (err) {
    return errorResponse(toApiError(err));
  }
}
