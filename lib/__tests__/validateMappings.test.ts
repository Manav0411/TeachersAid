import { describe, expect, it, vi } from "vitest";
import { validateMappings } from "@/lib/mapping/index";
import type { AnswerSegment, Mapping, Question } from "@/lib/types";

function question(id: string): Question {
  return {
    id,
    displayNumber: id,
    sortKey: [1],
    text: "",
    type: "short",
    pageIndex: 0,
  };
}

function segment(id: string): AnswerSegment {
  return {
    id,
    detectedLabel: null,
    transcript: "",
    regions: [],
    isContinuation: false,
    isStruckThrough: false,
    legibility: "clear",
    confidence: 1,
  };
}

describe("validateMappings", () => {
  it("passes when every question has exactly one mapping and segments appear at most once", () => {
    const questions = [question("q1"), question("q2")];
    const segments = [segment("s1")];
    const mappings: Mapping[] = [
      { questionId: "q1", segmentIds: ["s1"], status: "answered", method: "label", confidence: 1 },
      { questionId: "q2", segmentIds: [], status: "unanswered", method: "label", confidence: 0 },
    ];
    expect(validateMappings(questions, segments, mappings)).toBe(true);
  });

  it("fails when a question has no mapping", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const questions = [question("q1"), question("q2")];
    const mappings: Mapping[] = [
      { questionId: "q1", segmentIds: [], status: "unanswered", method: "label", confidence: 0 },
    ];
    expect(validateMappings(questions, [], mappings)).toBe(false);
    warn.mockRestore();
  });

  it("fails when a segment appears in more than one mapping", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const questions = [question("q1"), question("q2")];
    const segments = [segment("s1")];
    const mappings: Mapping[] = [
      { questionId: "q1", segmentIds: ["s1"], status: "answered", method: "label", confidence: 1 },
      { questionId: "q2", segmentIds: ["s1"], status: "answered", method: "label", confidence: 1 },
    ];
    expect(validateMappings(questions, segments, mappings)).toBe(false);
    warn.mockRestore();
  });
});
