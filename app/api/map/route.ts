import { geminiProvider } from "@/lib/ai/gemini";
import { withRetry } from "@/lib/pool";
import { buildMappingPrompt } from "@/lib/prompts/mapping";
import { MapModelResponse, MapRequest } from "@/lib/schemas";
import { errorResponse, okResponse, toApiError } from "@/lib/ai/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

/** One LLM call matching whatever's left after deterministic label matching. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse({ code: "invalid_request", message: "Request body must be JSON", retryable: false });
  }

  const parsedReq = MapRequest.safeParse(body);
  if (!parsedReq.success) {
    return errorResponse({ code: "invalid_request", message: parsedReq.error.message, retryable: false });
  }

  const { questions, segments } = parsedReq.data;

  if (segments.length === 0 || questions.length === 0) {
    return okResponse({ matches: [] });
  }

  try {
    const raw = await withRetry(() =>
      geminiProvider.generateJson({
        prompt: buildMappingPrompt({
          questions: questions.map((q) => ({
            id: q.id,
            display_number: q.display_number,
            text: q.text,
            type: q.type,
          })),
          answers: segments.map((s) => ({
            id: s.id,
            transcript_first_400_chars: s.transcript_first_400_chars,
          })),
        }),
      })
    );
    const data = MapModelResponse.parse(raw);
    return okResponse(data);
  } catch (err) {
    return errorResponse(toApiError(err));
  }
}
