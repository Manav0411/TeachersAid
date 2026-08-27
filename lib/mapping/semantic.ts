import type { AnswerSegment, Question } from "@/lib/types";

export type SemanticMatch = {
  answerId: string;
  questionId: string | null;
  confidence: number;
  reason?: string;
};

type MapApiResponse =
  | {
      ok: true;
      data: {
        matches: {
          answer_id: string;
          question_id: string | null;
          confidence: number;
          reason?: string;
        }[];
      };
    }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

/** PRD §6.4 step D — one LLM call matching the still-unmatched residue. */
export async function semanticMatch(
  questions: Question[],
  segments: AnswerSegment[]
): Promise<SemanticMatch[]> {
  if (questions.length === 0 || segments.length === 0) return [];

  const res = await fetch("/api/map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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
  });

  const json = (await res.json()) as MapApiResponse;
  if (!json.ok) {
    console.warn("[semanticMatch] /api/map failed:", json.error);
    return [];
  }
  return json.data.matches.map((m) => ({
    answerId: m.answer_id,
    questionId: m.question_id,
    confidence: m.confidence,
    reason: m.reason,
  }));
}
