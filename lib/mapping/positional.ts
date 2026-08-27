import type { Question } from "@/lib/types";

export function compareSortKey(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? -Infinity;
    const bv = b[i] ?? -Infinity;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export type PositionalResult = { questionId: string; confidence: number };

/**
 * PRD §6.4 step E — for a still-unmatched segment sitting in reading order
 * between two confidently matched segments (questions Qi and Qj), restrict
 * candidates to questions between Qi and Qj in printed order. Boost
 * confidence by 0.1 when it's the sole candidate.
 */
export function positionalNarrow(
  unmatchedSegmentIds: string[],
  /** All segment ids, in reading order (page, then top-to-bottom). */
  segmentOrder: string[],
  /** segmentId -> questionId, for segments already matched by earlier steps. */
  matchedQuestionForSegment: Map<string, string>,
  /** Still-unanswered questions, any order. */
  candidateQuestions: Question[]
): Map<string, PositionalResult> {
  const result = new Map<string, PositionalResult>();
  const byId = new Map(candidateQuestions.map((q) => [q.id, q]));
  const claimed = new Set<string>();

  for (const segId of unmatchedSegmentIds) {
    const pos = segmentOrder.indexOf(segId);
    if (pos === -1) continue;

    let beforeQ: Question | null = null;
    for (let i = pos - 1; i >= 0; i--) {
      const qid = matchedQuestionForSegment.get(segmentOrder[i]);
      if (qid) {
        beforeQ = byId.get(qid) ?? null;
        break;
      }
    }
    let afterQ: Question | null = null;
    for (let i = pos + 1; i < segmentOrder.length; i++) {
      const qid = matchedQuestionForSegment.get(segmentOrder[i]);
      if (qid) {
        afterQ = byId.get(qid) ?? null;
        break;
      }
    }

    const candidates = candidateQuestions
      .filter((q) => !claimed.has(q.id))
      .filter((q) => !beforeQ || compareSortKey(q.sortKey, beforeQ.sortKey) >= 0)
      .filter((q) => !afterQ || compareSortKey(q.sortKey, afterQ.sortKey) <= 0)
      .sort((a, b) => compareSortKey(a.sortKey, b.sortKey));

    if (candidates.length === 1) {
      result.set(segId, { questionId: candidates[0].id, confidence: 0.65 });
      claimed.add(candidates[0].id);
    } else if (candidates.length > 1) {
      // No further signal to re-score with — take the nearest in printed
      // order, right at the acceptance threshold.
      result.set(segId, { questionId: candidates[0].id, confidence: 0.55 });
      claimed.add(candidates[0].id);
    }
  }

  return result;
}
