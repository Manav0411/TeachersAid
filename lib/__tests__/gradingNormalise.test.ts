import { describe, expect, it } from "vitest";
import { computeSummary, fromRawGrade } from "@/lib/grading/normalise";
import type { Grade, Mapping, Question } from "@/lib/types";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    displayNumber: id,
    sortKey: [1],
    text: `Question ${id}`,
    marks: 5,
    type: "short",
    pageIndex: 0,
    ...overrides,
  };
}

function mapping(questionId: string, status: Mapping["status"] = "answered"): Mapping {
  return { questionId, segmentIds: status === "answered" ? ["seg"] : [], status, method: "label", confidence: 1 };
}

function grade(questionId: string, awarded: number, max: number): Grade {
  return { questionId, awarded, max, verdict: "correct", feedback: "", missedPoints: [], gradingConfidence: 1 };
}

const noModelParts = { strengths: [], weaknesses: [], overallFeedback: "" };

describe("fromRawGrade", () => {
  it("clamps an over-max awarded score to the question's max", () => {
    const g = fromRawGrade(
      { question_id: "q1", awarded: 8, verdict: "correct", feedback: "", missed_points: [], confidence: 1 },
      5
    );
    expect(g.awarded).toBe(5);
  });

  it("clamps a negative awarded score to 0", () => {
    const g = fromRawGrade(
      { question_id: "q1", awarded: -2, verdict: "incorrect", feedback: "", missed_points: [], confidence: 1 },
      5
    );
    expect(g.awarded).toBe(0);
  });

  it("leaves an in-range score untouched", () => {
    const g = fromRawGrade(
      { question_id: "q1", awarded: 3, verdict: "partially_correct", feedback: "", missed_points: [], confidence: 1 },
      5
    );
    expect(g.awarded).toBe(3);
  });
});

describe("computeSummary — Attempt any N of M", () => {
  const instruction = "Attempt any 2 of the following 4 questions.";
  const questions = ["a", "b", "c", "d"].map((id) => q(id, { instruction, marks: 5 }));

  it("counts everything when exactly N are answered (unchanged behavior)", () => {
    const mappings = [mapping("a"), mapping("b"), mapping("c", "unanswered"), mapping("d", "unanswered")];
    const grades = [grade("a", 4, 5), grade("b", 3, 5), grade("c", 0, 5), grade("d", 0, 5)];
    const summary = computeSummary(questions, mappings, grades, noModelParts);
    expect(summary.totalMax).toBe(10); // only the 2 answered ones count
    expect(summary.totalAwarded).toBe(7);
  });

  it("counts nothing extra when fewer than N are answered (unchanged behavior)", () => {
    const mappings = [mapping("a"), mapping("b", "unanswered"), mapping("c", "unanswered"), mapping("d", "unanswered")];
    // Matches real pipeline usage: unanswered mappings get a 0-score
    // Grade too (localUnansweredGrades), not just the answered one.
    const grades = [grade("a", 4, 5), grade("b", 0, 5), grade("c", 0, 5), grade("d", 0, 5)];
    const summary = computeSummary(questions, mappings, grades, noModelParts);
    // Below quota: nothing gets excluded, so all 4 questions' max counts.
    expect(summary.totalMax).toBe(20);
    expect(summary.totalAwarded).toBe(4);
  });

  it("credits only the best N when a student answers MORE than N (regression)", () => {
    // All 4 answered; only the top 2 by score should count toward the total.
    const mappings = questions.map((question) => mapping(question.id));
    const grades = [grade("a", 1, 5), grade("b", 5, 5), grade("c", 2, 5), grade("d", 4, 5)];
    const summary = computeSummary(questions, mappings, grades, noModelParts);
    expect(summary.totalMax).toBe(10); // best 2 (b, d) only
    expect(summary.totalAwarded).toBe(9); // 5 + 4
  });
});
