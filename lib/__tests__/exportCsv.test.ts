import { describe, expect, it } from "vitest";
import { buildGradesCsv } from "@/lib/exportCsv";
import { emptySession } from "@/lib/session/reducer";
import type { Question } from "@/lib/types";

function q(overrides: Partial<Question>): Question {
  return {
    id: "q1",
    displayNumber: "1",
    sortKey: [1],
    text: "text",
    type: "short",
    pageIndex: 0,
    ...overrides,
  };
}

describe("buildGradesCsv", () => {
  it("writes one row per question in order, with grades looked up by questionId", () => {
    const session = {
      ...emptySession("s1"),
      questions: [q({ id: "q1", displayNumber: "1", text: "2 + 2?" })],
      grades: [
        {
          questionId: "q1",
          awarded: 2,
          max: 2,
          verdict: "correct" as const,
          feedback: "Correct.",
          missedPoints: [],
          gradingConfidence: 0.9,
        },
      ],
    };

    const csv = buildGradesCsv(session);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("#,Question,Verdict,Score,Max,Feedback");
    expect(lines[1]).toBe("1,2 + 2?,correct,2,2,Correct.");
  });

  it("leaves Verdict/Score blank for an ungraded question instead of crashing", () => {
    const session = {
      ...emptySession("s1"),
      questions: [q({ id: "q1" })],
      grades: [],
    };

    const csv = buildGradesCsv(session);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("1,text,,,,");
  });

  it("quotes fields containing commas or quotes per RFC 4180", () => {
    const session = {
      ...emptySession("s1"),
      questions: [q({ id: "q1", text: 'Explain "photosynthesis", briefly.' })],
      grades: [
        {
          questionId: "q1",
          awarded: 1,
          max: 2,
          verdict: "partially_correct" as const,
          feedback: "Missing detail, chlorophyll not mentioned.",
          missedPoints: [],
          gradingConfidence: 0.8,
        },
      ],
    };

    const csv = buildGradesCsv(session);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe(
      '1,"Explain ""photosynthesis"", briefly.",partially_correct,1,2,"Missing detail, chlorophyll not mentioned."'
    );
  });

  it("appends a summary block when the session has a summary", () => {
    const session = {
      ...emptySession("s1"),
      questions: [q({ id: "q1" })],
      grades: [],
      summary: {
        totalAwarded: 4,
        totalMax: 10,
        percentage: 40,
        answered: 1,
        unanswered: 0,
        unmatched: 0,
        strengths: [],
        weaknesses: [],
        overallFeedback: "Needs more detail overall.",
      },
    };

    const csv = buildGradesCsv(session);
    expect(csv).toContain("Total score,4/10");
    expect(csv).toContain("Percentage,40%");
    expect(csv).toContain("Overall feedback,Needs more detail overall.");
  });
});
