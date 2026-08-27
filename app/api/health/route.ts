import { z } from "zod";
import { geminiProvider } from "@/lib/ai/gemini";
import { errorResponse, okResponse, toApiError } from "@/lib/ai/route-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const HealthModelResponse = z.object({
  status: z.literal("ok"),
  message: z.string(),
});

/**
 * Smoke-test route for M0: round-trips a trivial prompt through Gemini and
 * confirms the response survives JSON hardening + Zod validation.
 */
export async function GET() {
  try {
    const raw = await geminiProvider.generateJson({
      prompt:
        'Return ONLY this exact JSON object, no markdown, no prose: {"status":"ok","message":"gemini reachable"}',
    });
    const data = HealthModelResponse.parse(raw);
    return okResponse(data);
  } catch (err) {
    return errorResponse(toApiError(err));
  }
}
