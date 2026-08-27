import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import type { z } from "zod";

/**
 * Text-only provider for grading/summary — Groq's free tier, deliberately
 * kept separate from the vision provider (lib/ai/gemini.ts). Extraction
 * needs to read handwriting/scans, which is why Gemini was chosen for
 * that; grading and summary only ever see already-transcribed text
 * (see app/api/grade/route.ts's own comment: "text only — no images
 * needed here"), so they don't need a vision-capable model at all, and
 * routing them to a separate free-tier provider keeps Gemini's quota for
 * the extraction calls that actually require it.
 *
 * Uses generateObject with the caller's own Zod schema (GradeModelResponse,
 * SummaryModelResponse in lib/schemas.ts) so the response shape is
 * constrained by the provider's native structured-output support —
 * no fence-stripping/brace-matching retry dance needed here, unlike
 * lib/ai/json.ts's parseModelJson (which stays in place for Gemini).
 */
// llama-3.3-70b-versatile has since been retired from Groq's free tier;
// openai/gpt-oss-120b (OpenAI's open-weight model, hosted free on Groq) is
// the current strong general-purpose choice, confirmed against Groq's own
// /v1/models listing.
const MODEL = "openai/gpt-oss-120b";

export async function generateGraded<T>(
  prompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  const { object } = await generateObject({
    model: groq(MODEL),
    schema,
    prompt,
  });
  return object;
}
