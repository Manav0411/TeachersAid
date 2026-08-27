import { describe, expect, it, vi } from "vitest";
import type { AnswerSegment, Question } from "@/lib/types";

vi.mock("@/lib/mapping/semantic", () => ({
  semanticMatch: vi.fn().mockResolvedValue([]),
}));

const { runMappingEngine } = await import("@/lib/mapping/index");

function question(id: string, sortKey: number[] = [1]): Question {
  return {
    id,
    displayNumber: id,
    sortKey,
    text: `Question ${id}`,
    type: "short",
    pageIndex: 0,
  };
}

function segment(overrides: Partial<AnswerSegment> & { id: string }): AnswerSegment {
  return {
    detectedLabel: null,
    transcript: "",
    regions: [{ pageIndex: 0, bbox: { x: 0, y: 0, w: 0.1, h: 0.02 } }],
    isContinuation: false,
    isStruckThrough: false,
    legibility: "clear",
    confidence: 1,
    ...overrides,
  };
}

describe("runMappingEngine — rough work exclusion", () => {
  it("never assigns a [rough work] segment to a question, even when it's the sole candidate", async () => {
    const questions = [question("q6", [6])];
    const segments = [
      segment({
        id: "seg-rough",
        detectedLabel: null,
        transcript: "[rough work] 6 CO2 + 6 H2O -> ?",
        regions: [{ pageIndex: 0, bbox: { x: 0, y: 0.5, w: 0.3, h: 0.02 } }],
      }),
    ];

    const { mappings } = await runMappingEngine(questions, segments);

    const questionMapping = mappings.find((m) => m.questionId === "q6");
    expect(questionMapping?.status).toBe("unanswered");

    const roughMapping = mappings.find((m) => m.segmentIds.includes("seg-rough"));
    expect(roughMapping?.status).toBe("unmatched");
    expect(roughMapping?.questionId).toBeNull();
    expect(roughMapping?.confidence).toBe(0);
  });

  it("still positionally matches a genuine unlabeled answer as the sole candidate (regression)", async () => {
    const questions = [question("q6", [6])];
    const segments = [
      segment({
        id: "seg-real",
        detectedLabel: null,
        transcript: "Water evaporates, condenses into clouds, then precipitates.",
        regions: [{ pageIndex: 0, bbox: { x: 0, y: 0.5, w: 0.3, h: 0.02 } }],
      }),
    ];

    const { mappings } = await runMappingEngine(questions, segments);

    const mapping = mappings.find((m) => m.segmentIds.includes("seg-real"));
    expect(mapping?.status).toBe("answered");
    expect(mapping?.questionId).toBe("q6");
    expect(mapping?.method).toBe("positional");
  });
});

describe("runMappingEngine — exact label match on a flat (no sub-parts) paper", () => {
  it("claims a plainly-numbered segment via step B, not the semantic residue (regression)", async () => {
    // Live-observed: canonicalizeLabel("1.") -> { major: 1, sub: null }, and
    // an earlier version of step B skipped every segment whose sub was
    // null — intended to defer bare parent labels ("11" on a paper with
    // 11(a)/11(b)) to step C, but it also skipped the overwhelmingly common
    // case of a paper with no sub-parts at all, forcing every plain answer
    // through the semantic/positional fallback instead of an exact match.
    const questions = [
      { ...question("q1", [1]), displayNumber: "1." },
      { ...question("q2", [2]), displayNumber: "2." },
    ];
    const segments = [
      segment({ id: "seg-1", detectedLabel: "1.", transcript: "H2O" }),
      segment({ id: "seg-2", detectedLabel: "2.", transcript: "Transpiration" }),
    ];

    const { mappings } = await runMappingEngine(questions, segments);

    const m1 = mappings.find((m) => m.questionId === "q1");
    expect(m1?.status).toBe("answered");
    expect(m1?.method).toBe("label");
    expect(m1?.confidence).toBe(0.97);
    expect(m1?.segmentIds).toEqual(["seg-1"]);
  });
});

describe("runMappingEngine — multiple segments sharing one label", () => {
  it("combines a clean segment with a struck-through duplicate (answered twice, edge case #8)", async () => {
    const questions = [{ ...question("q1", [1]), displayNumber: "1." }];
    const segments = [
      segment({ id: "seg-struck", detectedLabel: "1.", isStruckThrough: true, transcript: "Chloroplast" }),
      segment({ id: "seg-clean", detectedLabel: "1.", transcript: "Mitochondria" }),
    ];

    const { mappings } = await runMappingEngine(questions, segments);

    const m1 = mappings.find((m) => m.questionId === "q1");
    expect(m1?.status).toBe("answered");
    expect(m1?.segmentIds).toEqual(["seg-clean", "seg-struck"]);
  });

  it("claims only the first of two CLEAN same-labelled segments, leaving the other for the residue (regression)", async () => {
    // Live-observed: two genuinely distinct answers ended up sharing a
    // canonical label with no strike-through on either — concatenating
    // both into one answer (the old behaviour) silently swallowed what
    // was actually a different question's answer. Only a struck-through
    // duplicate justifies auto-combining; two clean matches are ambiguous.
    const questions = [
      { ...question("q1", [1]), displayNumber: "1." },
      { ...question("q2", [2]), displayNumber: "2." },
    ];
    const segments = [
      segment({ id: "seg-h2o", detectedLabel: "1.", transcript: "H2O" }),
      segment({ id: "seg-transpiration", detectedLabel: "1.", transcript: "Transpiration is the process..." }),
    ];

    const { mappings } = await runMappingEngine(questions, segments);

    const m1 = mappings.find((m) => m.questionId === "q1");
    expect(m1?.status).toBe("answered");
    expect(m1?.segmentIds).toEqual(["seg-h2o"]);

    // The second segment must NOT have been silently absorbed into q1 —
    // it's left for steps D/E (here: unclaimed, since semanticMatch is
    // mocked to return no matches and there's no second candidate left).
    const strayMapping = mappings.find((m) => m.segmentIds.includes("seg-transpiration"));
    expect(strayMapping?.questionId).not.toBe("q1");
  });
});
