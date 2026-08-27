import { geminiProvider } from "@/lib/ai/gemini";
import { withRetry } from "@/lib/pool";
import { buildSummaryPrompt } from "@/lib/prompts/grading";
import { SummaryModelResponse, SummaryRequest } from "@/lib/schemas";
import { errorResponse, okResponse, toApiError } from "@/lib/ai/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: "invalid_request", message: "Request body must be JSON", retryable: false });
  }

  const parsedReq = SummaryRequest.safeParse(body);
  if (!parsedReq.success) {
    return errorResponse({ code: "invalid_request", message: parsedReq.error.message, retryable: false });
  }

  try {
    const raw = await withRetry(() =>
      geminiProvider.generateJson({
        prompt: buildSummaryPrompt({
          grades: parsedReq.data.grades.map((g) => ({
            display_number: g.display_number,
            awarded: g.awarded,
            verdict: g.verdict,
            feedback: g.feedback,
          })),
          counts: parsedReq.data.counts,
        }),
      })
    );
    const data = SummaryModelResponse.parse(raw);
    return okResponse(data);
  } catch (err) {
    return errorResponse(toApiError(err));
  }
}
