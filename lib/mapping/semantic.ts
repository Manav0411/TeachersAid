import type { AnswerSegment, Question } from "@/lib/types";
import type { MapModelResponse } from "@/lib/schemas";
import { postJson } from "@/lib/session/api";
import { withRetry } from "@/lib/pool";

export type SemanticMatch = {
  answerId: string;
  questionId: string | null;
  confidence: number;
  reason?: string;
};

/**
 * One LLM call matching the still-unmatched residue. Resilient by design —
 * on total failure (after retries) this returns `[]` rather than throwing,
 * so one bad mapping call never fails the whole pipeline; the failure is
 * still logged so it isn't silently invisible during development.
 */
export async function semanticMatch(
  questions: Question[],
  segments: AnswerSegment[],
  opts: { onRetry?: (err: unknown) => void } = {}
): Promise<SemanticMatch[]> {
  if (questions.length === 0 || segments.length === 0) return [];

  try {
    const data = await withRetry(
      () =>
        postJson<MapModelResponse>("/api/map", {
          questions: questions.map((q) => ({
            id: q.id,
            display_number: q.displayNumber,
            text: q.text,
            type: q.type,
          })),
          segments: segments.map((s) => ({
            id: s.id,
            transcript_first_400_chars: s.transcript.slice(0, 400),
          })),
        }),
      { onRetry: opts.onRetry }
    );
    return data.matches.map((m) => ({
      answerId: m.answer_id,
      questionId: m.question_id,
      confidence: m.confidence,
      reason: m.reason,
    }));
  } catch (err) {
    console.warn("[semanticMatch] /api/map failed after retries:", err);
    return [];
  }
}
