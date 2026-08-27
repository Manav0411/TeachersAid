import type { AnswerSegment, Grade, Mapping, Question, Summary } from "@/lib/types";
import type { GradeItemInput, RawGrade } from "@/lib/schemas";

const DEFAULT_MAX_MARKS = 1;

/** Build the transcript to grade for a question from its mapped segments. */
function transcriptFor(mapping: Mapping, segmentsById: Map<string, AnswerSegment>): string {
  return mapping.segmentIds
    .map((id) => segmentsById.get(id))
    .filter((s): s is AnswerSegment => Boolean(s) && !s!.isStruckThrough)
    .map((s) => s.transcript)
    .join("\n");
}

/**
 * Groups questions sharing an "Attempt any N of M" instruction (PRD §6.5,
 * edge case #14) and returns the ids of unattempted questions in a group
 * once the quota is already met — these are excluded from totalMax.
 */
export function optionalUnattemptedIds(
  questions: Question[],
  mappings: Mapping[]
): Set<string> {
  const groups = new Map<string, Question[]>();
  for (const q of questions) {
    const match = q.instruction?.match(/attempt\s+any\s+(\d+)/i);
    if (!match) continue;
    const key = `${q.section ?? ""}::${q.instruction}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q);
  }

  const excluded = new Set<string>();
  for (const groupQuestions of groups.values()) {
    const required = parseInt(groupQuestions[0].instruction!.match(/attempt\s+any\s+(\d+)/i)![1], 10);
    const answeredCount = groupQuestions.filter(
      (q) => mappings.find((m) => m.questionId === q.id)?.status === "answered"
    ).length;
    if (answeredCount >= required) {
      for (const q of groupQuestions) {
        if (mappings.find((m) => m.questionId === q.id)?.status !== "answered") {
          excluded.add(q.id);
        }
      }
    }
  }
  return excluded;
}

/** Build /api/grade's ITEMS for every answered question (PRD §6.5). */
export function buildGradeItems(
  questions: Question[],
  mappings: Mapping[],
  segments: AnswerSegment[]
): GradeItemInput[] {
  const segmentsById = new Map(segments.map((s) => [s.id, s]));
  const questionsById = new Map(questions.map((q) => [q.id, q]));

  return mappings
    .filter((m) => m.status === "answered" && m.questionId)
    .map((m) => {
      const q = questionsById.get(m.questionId!)!;
      return {
        question_id: q.id,
        display_number: q.displayNumber,
        question_text: q.text,
        type: q.type,
        max_marks: q.marks ?? DEFAULT_MAX_MARKS,
        student_answer: transcriptFor(m, segmentsById) || "[blank]",
      };
    });
}

/** Local grades for questions the model never sees: unanswered ones score 0. */
export function localUnansweredGrades(questions: Question[], mappings: Mapping[]): Grade[] {
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  return mappings
    .filter((m) => m.status === "unanswered" && m.questionId)
    .map((m) => {
      const q = questionsById.get(m.questionId!)!;
      return {
        questionId: q.id,
        awarded: 0,
        max: q.marks ?? DEFAULT_MAX_MARKS,
        verdict: "unanswered" as const,
        feedback: "No answer was found for this question.",
        missedPoints: [],
        gradingConfidence: 1,
      };
    });
}

export function fromRawGrade(raw: RawGrade, max: number): Grade {
  return {
    questionId: raw.question_id,
    awarded: raw.awarded,
    max,
    verdict: raw.verdict,
    feedback: raw.feedback,
    missedPoints: raw.missed_points,
    gradingConfidence: raw.confidence,
  };
}

/** Combine grades + mapping counts into the final Summary (PRD §6.5 / §5). */
export function buildLocalSummaryCounts(mappings: Mapping[]) {
  return {
    answered: mappings.filter((m) => m.status === "answered").length,
    unanswered: mappings.filter((m) => m.status === "unanswered").length,
    unmatched: mappings.filter((m) => m.status === "unmatched").length,
  };
}

export function computeSummary(
  questions: Question[],
  mappings: Mapping[],
  grades: Grade[],
  modelParts: { strengths: string[]; weaknesses: string[]; overallFeedback: string }
): Summary {
  const excluded = optionalUnattemptedIds(questions, mappings);
  const counted = grades.filter((g) => !excluded.has(g.questionId));

  const totalAwarded = counted.reduce((sum, g) => sum + g.awarded, 0);
  const totalMax = counted.reduce((sum, g) => sum + g.max, 0);
  const counts = buildLocalSummaryCounts(mappings);

  return {
    totalAwarded,
    totalMax,
    percentage: totalMax > 0 ? Math.round((totalAwarded / totalMax) * 100) : 0,
    ...counts,
    strengths: modelParts.strengths,
    weaknesses: modelParts.weaknesses,
    overallFeedback: modelParts.overallFeedback,
  };
}
