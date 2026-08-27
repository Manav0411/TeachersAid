import { geminiProvider } from "@/lib/ai/gemini";
import { withRetry } from "@/lib/pool";
import { QUESTIONS_PROMPT } from "@/lib/prompts/questions";
import { ExtractQuestionsModelResponse, ExtractQuestionsRequest } from "@/lib/schemas";
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

  const parsedReq = ExtractQuestionsRequest.safeParse(body);
  if (!parsedReq.success) {
    return errorResponse({ code: "invalid_request", message: parsedReq.error.message, retryable: false });
  }

  const { page } = parsedReq.data;

  try {
    const raw = await withRetry(() =>
      geminiProvider.generateJson({
        prompt: QUESTIONS_PROMPT,
        image: { dataUrl: page.dataUrl },
      })
    );
    const data = ExtractQuestionsModelResponse.parse(raw);
    return okResponse(data);
  } catch (err) {
    return errorResponse(toApiError(err));
  }
}
