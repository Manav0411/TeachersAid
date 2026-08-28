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
 * Groups questions sharing an "Attempt any N of M" instruction and returns
 * the ids excluded from totalMax/totalAwarded: unattempted questions once
 * the quota is already met, AND — the standard "credit only the best N
 * attempted" exam convention — the lowest-scoring excess when a student
 * answers MORE than N (grading still runs on every answered question, for
 * feedback; only the summary total caps at N).
 */
export function excludedByAttemptAnyN(
  questions: Question[],
  mappings: Mapping[],
  grades: Grade[]
): Set<string> {
  const gradeByQuestion = new Map(grades.map((g) => [g.questionId, g]));
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
    const answered = groupQuestions.filter(
      (q) => mappings.find((m) => m.questionId === q.id)?.status === "answered"
    );
    if (answered.length >= required) {
      for (const q of groupQuestions) {
        if (!answered.includes(q)) excluded.add(q.id);
      }
      if (answered.length > required) {
        const scoreRatio = (q: Question) => {
          const g = gradeByQuestion.get(q.id);
          return g && g.max > 0 ? g.awarded / g.max : 0;
        };
        const bestFirst = [...answered].sort((a, b) => scoreRatio(b) - scoreRatio(a));
        for (const q of bestFirst.slice(required)) excluded.add(q.id);
      }
    }
  }
  return excluded;
}

/** Build /api/grade's ITEMS for every answered question. */
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
    // The schema only floors at 0 (it doesn't know max_marks); clamp the
    // ceiling here, where both values are actually in scope, so a
    // hallucinated or "half marks" over-award can't push a question past
    // its own max — or a summary above 100%.
    awarded: Math.max(0, Math.min(raw.awarded, max)),
    max,
    verdict: raw.verdict,
    feedback: raw.feedback,
    missedPoints: raw.missed_points,
    gradingConfidence: raw.confidence,
  };
}

/** Combine grades + mapping counts into the final Summary. */
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
  const excluded = excludedByAttemptAnyN(questions, mappings, grades);
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
