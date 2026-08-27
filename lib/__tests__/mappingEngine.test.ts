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

describe("runMappingEngine — step B cross-question label collisions", () => {
  it("claims a segment for at most one of several questions sharing an identical bare canonical label (regression)", async () => {
    // Live-observed on a real paper: several distinct sub-part questions
    // each lost their parent number during extraction, leaving displayNumber
    // as just a bare marker ("(a)", "(i)", "(ii)"...). Every one of those
    // canonicalises to the same (major: null, sub: X) key, so a single
    // bare-labelled answer segment matched ALL of them in step B — one
    // segment ended up in 5 separate mappings on the real run. First match
    // in question order must win; later colliding questions get nothing.
    const questions = [
      { ...question("qa1", [1]), displayNumber: "(a)" },
      { ...question("qa2", [2]), displayNumber: "(a)" },
    ];
    const segments = [segment({ id: "seg-a", detectedLabel: "(a)", transcript: "Some answer" })];

    const { mappings } = await runMappingEngine(questions, segments);

    const segmentOccurrences = mappings.filter((m) => m.segmentIds.includes("seg-a"));
    expect(segmentOccurrences).toHaveLength(1);
    expect(segmentOccurrences[0]?.questionId).toBe("qa1");

    const qa2Mapping = mappings.find((m) => m.questionId === "qa2");
    expect(qa2Mapping?.status).not.toBe("answered");
  });
});

describe("runMappingEngine — step C parent-label split", () => {
  it("splits a parent-only segment into its lettered children when every internal marker matches (regression)", async () => {
    const questions = [
      { ...question("q11a", [11, 1]), displayNumber: "11(a)" },
      { ...question("q11b", [11, 2]), displayNumber: "11(b)" },
    ];
    const segments = [
      segment({
        id: "seg-11",
        detectedLabel: "11",
        transcript: "(a) First answer\n(b) Second answer",
      }),
    ];

    const { mappings, derivedSegments } = await runMappingEngine(questions, segments);

    expect(derivedSegments).toHaveLength(2);
    const ma = mappings.find((m) => m.questionId === "q11a");
    const mb = mappings.find((m) => m.questionId === "q11b");
    expect(ma?.status).toBe("answered");
    expect(mb?.status).toBe("answered");
  });

  it("does not split — and does not duplicate-claim — when only one internal marker coincidentally matches a lettered sibling (regression)", async () => {
    // Live-observed: a parent-only segment ("25") held one full answer to
    // the sole lettered child ("25(a)", an OR-choice part) but the student
    // broke that single answer into their own numbered list, "(i) ... (ii)
    // ... (iii) ...". canonicalizeLabel unifies roman "i" and letter "a"
    // onto the same canonical sub, so chunk (i) alone false-matched
    // "25(a)" while chunks (ii)/(iii) matched nothing and were silently
    // dropped — and if "25(a)" was *also* claimed elsewhere (e.g. an exact
    // label match on another page), this produced the observed duplicate
    // mapping. A split must be all-or-nothing: since (ii)/(iii) can't
    // resolve, the whole segment must stay whole instead of partially
    // matching.
    const questions = [{ ...question("q25a", [25, 1]), displayNumber: "25(a)" }];
    const segments = [
      segment({
        id: "seg-25",
        detectedLabel: "25",
        transcript: "(i) First point\n(ii) Second point\n(iii) Third point",
      }),
    ];

    const { mappings, derivedSegments } = await runMappingEngine(questions, segments);

    // No partial split: the segment was not sliced into derived chunks.
    expect(derivedSegments).toHaveLength(0);

    // q25a is claimed at most once (the invariant the bug violated), and
    // no content was silently dropped — seg-25 survives whole and ends up
    // matched (positionally, since it's the sole remaining segment/question
    // pair) rather than fragmented.
    const questionMappings = mappings.filter((m) => m.questionId === "q25a");
    expect(questionMappings).toHaveLength(1);
    const segMapping = mappings.find((m) => m.segmentIds.includes("seg-25"));
    expect(segMapping?.questionId).toBe("q25a");
  });
});

describe("runMappingEngine — nested OR-choice sub-parts (labels.ts fix)", () => {
  it("matches each sibling's own nested roman sub-part instead of colliding on the trailing marker", async () => {
    // Two OR-choice questions ("24(a)" and "24(b)"), each further broken
    // into roman sub-points — before canonicalizeLabel accumulated every
    // sub-token, "24(a)(i)" and "24(b)(i)" both collapsed to
    // { major: 24, sub: "a" } (only the trailing "i" survived).
    const questions = [
      { ...question("q24a-i", [24, 1, 1]), displayNumber: "24(a)(i)" },
      { ...question("q24b-i", [24, 2, 1]), displayNumber: "24(b)(i)" },
    ];
    const segments = [
      segment({ id: "seg-a-i", detectedLabel: "24(a)(i)", transcript: "Answer for a(i)" }),
      segment({ id: "seg-b-i", detectedLabel: "24(b)(i)", transcript: "Answer for b(i)" }),
    ];

    const { mappings } = await runMappingEngine(questions, segments);

    const mA = mappings.find((m) => m.questionId === "q24a-i");
    const mB = mappings.find((m) => m.questionId === "q24b-i");
    expect(mA?.status).toBe("answered");
    expect(mA?.method).toBe("label");
    expect(mA?.segmentIds).toEqual(["seg-a-i"]);
    expect(mB?.status).toBe("answered");
    expect(mB?.method).toBe("label");
    expect(mB?.segmentIds).toEqual(["seg-b-i"]);
  });
});
