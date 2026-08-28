import { describe, expect, it } from "vitest";
import { emptySession, sessionReducer } from "@/lib/session/reducer";
import type { Mapping } from "@/lib/types";

function withMappings(mappings: Mapping[]) {
  return { ...emptySession("s1"), mappings };
}

describe("sessionReducer REASSIGN_SEGMENT", () => {
  it("marks a question unanswered (not gone) when its last segment is detached", () => {
    const state = withMappings([
      { questionId: "q1", segmentIds: ["seg1"], status: "answered", method: "label", confidence: 0.9 },
    ]);

    const next = sessionReducer(state, {
      type: "REASSIGN_SEGMENT",
      segmentId: "seg1",
      questionId: null,
    });

    const q1Mapping = next.mappings.find((m) => m.questionId === "q1");
    expect(q1Mapping).toBeDefined();
    expect(q1Mapping?.status).toBe("unanswered");
    expect(q1Mapping?.segmentIds).toEqual([]);
  });

  it("only detaches the given segment, leaving the mapping's other segments intact", () => {
    const state = withMappings([
      {
        questionId: "q1",
        segmentIds: ["seg1", "seg2"],
        status: "answered",
        method: "label",
        confidence: 0.9,
      },
    ]);

    const next = sessionReducer(state, {
      type: "REASSIGN_SEGMENT",
      segmentId: "seg1",
      questionId: null,
    });

    const q1Mapping = next.mappings.find((m) => m.questionId === "q1");
    expect(q1Mapping?.segmentIds).toEqual(["seg2"]);
    expect(q1Mapping?.status).toBe("answered");
  });

  it("moves a segment onto a new question, creating its mapping if needed", () => {
    const state = withMappings([
      { questionId: "q1", segmentIds: ["seg1"], status: "answered", method: "label", confidence: 0.9 },
    ]);

    const next = sessionReducer(state, {
      type: "REASSIGN_SEGMENT",
      segmentId: "seg1",
      questionId: "q2",
    });

    expect(next.mappings.find((m) => m.questionId === "q1")?.status).toBe("unanswered");
    const q2Mapping = next.mappings.find((m) => m.questionId === "q2");
    expect(q2Mapping?.segmentIds).toEqual(["seg1"]);
    expect(q2Mapping?.status).toBe("answered");
    expect(q2Mapping?.method).toBe("manual");
  });
});
