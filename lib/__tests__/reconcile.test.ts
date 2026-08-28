import { describe, expect, it } from "vitest";
import { parseSortKey, reconcileQuestions, slugify } from "@/lib/questions/reconcile";
import type { RawQuestion } from "@/lib/schemas";

function q(overrides: Partial<RawQuestion>): RawQuestion {
  return {
    display_number: "1",
    parent_number: null,
    text: "text",
    type: "short",
    continues_from_previous_page: false,
    continues_on_next_page: false,
    ...overrides,
  };
}

describe("parseSortKey", () => {
  it("parses '11 (a)' -> [11, 1]", () => {
    expect(parseSortKey("11 (a)", [0])).toEqual([11, 1]);
  });
  it("parses roman '(iii)' -> [3]", () => {
    expect(parseSortKey("(iii)", [0])).toEqual([3]);
  });
  it("parses a single-char roman sub-part '(i)' as roman 1, not letter 9 (regression)", () => {
    // Found live: with sibling "12 (ii)"/"12 (iii)" on the same paper, a
    // bare "12 (i)" was sorting after both because "i" was parsed as the
    // 9th letter instead of roman numeral 1.
    expect(parseSortKey("12 (i)", [0])).toEqual([12, 1]);
    expect(parseSortKey("12 (ii)", [0])).toEqual([12, 2]);
    expect(parseSortKey("12 (iii)", [0])).toEqual([12, 3]);
  });
  it("falls back when nothing parses", () => {
    expect(parseSortKey("***", [42])).toEqual([42]);
  });
});

describe("slugify", () => {
  it("produces a stable kebab-case id", () => {
    expect(slugify("Section B 11 (a)")).toBe("section-b-11-a");
  });
});

describe("reconcileQuestions", () => {
  it("splits sub-parts into separate entries with shared parentNumber (edge case #1)", () => {
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: [
          q({ display_number: "11 (a)", parent_number: "11", text: "part a" }),
          q({ display_number: "11 (b)", parent_number: "11", text: "part b" }),
        ],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.displayNumber)).toEqual(["11 (a)", "11 (b)"]);
    expect(result.every((r) => r.parentNumber === "11")).toBe(true);
  });

  it("keeps printed order even when pages arrive out of order", () => {
    const result = reconcileQuestions([
      { pageIndex: 1, section: null, questions: [q({ display_number: "3" })] },
      { pageIndex: 0, section: null, questions: [q({ display_number: "1" })] },
    ]);
    expect(result.map((r) => r.displayNumber)).toEqual(["1", "3"]);
  });

  it("stitches a question split across a page break", () => {
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: [
          q({
            display_number: "4",
            text: "Describe the flow of blood through the human heart",
            continues_on_next_page: true,
          }),
        ],
      },
      {
        pageIndex: 1,
        section: null,
        questions: [
          q({
            display_number: "4",
            text: "starting from the right atrium.",
            continues_from_previous_page: true,
          }),
        ],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("human heart");
    expect(result[0].text).toContain("right atrium");
  });

  it("dedupes exact repeated display_numbers within a section", () => {
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: "Section A",
        questions: [q({ display_number: "1" }), q({ display_number: "1" })],
      },
    ]);
    expect(result).toHaveLength(1);
  });

  it("assigns stable, unique ids", () => {
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: "Section A",
        questions: [q({ display_number: "1" })],
      },
    ]);
    expect(result[0].id).toBe("section-a-1");
  });

  it("combines a bare sub-part marker with its parent_number (regression)", () => {
    // Live-observed: a nested sub-part printed with only its own marker
    // ("(i)") relies on parent_number ("24(b)") to carry the full
    // identity. Before this fix, parent_number was captured but never
    // consumed — displayNumber stayed bare "(i)", losing the major
    // number entirely and colliding with any other question's own bare
    // "(i)"/"(a)" marker.
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: [
          q({ display_number: "(i)", parent_number: "24(b)", text: "nested part" }),
        ],
      },
    ]);
    expect(result[0].displayNumber).toBe("24(b) (i)");
    expect(result[0].sortKey).toEqual([24, 2, 1]);
  });

  it("does not double-prefix when display_number already includes the parent (regression)", () => {
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: [q({ display_number: "24(b)(i)", parent_number: "24(b)" })],
      },
    ]);
    expect(result[0].displayNumber).toBe("24(b)(i)");
  });

  it("leaves a flat paper (no parent_number anywhere) unaffected", () => {
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: [q({ display_number: "1" }), q({ display_number: "2" })],
      },
    ]);
    expect(result.map((r) => r.displayNumber)).toEqual(["1", "2"]);
  });

  it("backfills a bare sub-part's missing parent_number from its preceding sibling (regression)", () => {
    // Live-observed on the real paper: "(a)" and "(b)" both correctly
    // carried parent_number "32(orig. Q39)", but a trailing "(c)" — on
    // a page boundary — came back from the model with parent_number:
    // null, leaving it bare and colliding with any other question's own
    // bare "(c)".
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: [
          q({ display_number: "(a)", parent_number: "32", text: "part a" }),
          q({ display_number: "(b)", parent_number: "32", text: "part b" }),
          q({ display_number: "(c)", parent_number: null, text: "part c" }),
        ],
      },
    ]);
    expect(result.map((r) => r.displayNumber)).toEqual(["32 (a)", "32 (b)", "32 (c)"]);
    expect(result[2].parentNumber).toBe("32");
  });

  it("does not leak an inherited parent onto the next genuinely new top-level question", () => {
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: [
          q({ display_number: "(a)", parent_number: "32", text: "part a" }),
          q({ display_number: "33", parent_number: null, text: "an unrelated question" }),
        ],
      },
    ]);
    expect(result.map((r) => r.displayNumber)).toEqual(["32 (a)", "33"]);
  });

  it("sorts a 6-part lettered sub-question a-f in printed order (regression)", () => {
    // Live bug: subPartIndex treated bare "c"/"d" as roman C=100/D=500,
    // so a-b-c-d-e-f sorted as a,b,e,f,c,d. With 4+ sibling evidence and
    // no multi-char roman token anywhere in the group, letter mode wins.
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: ["a", "b", "c", "d", "e", "f"].map((letter) =>
          q({ display_number: `(${letter})`, parent_number: "24", text: `part ${letter}` })
        ),
      },
    ]);
    expect(result.map((r) => r.displayNumber)).toEqual([
      "24 (a)",
      "24 (b)",
      "24 (c)",
      "24 (d)",
      "24 (e)",
      "24 (f)",
    ]);
  });

  it("still sorts a genuine roman i-v sequence correctly (unaffected by the letter-mode fix)", () => {
    // Multi-char siblings ("ii", "iii", "iv") are unambiguous roman
    // evidence, so the whole group — including the ambiguous single-char
    // "i" and "v" — stays in roman mode.
    const result = reconcileQuestions([
      {
        pageIndex: 0,
        section: null,
        questions: ["i", "ii", "iii", "iv", "v"].map((numeral) =>
          q({ display_number: `(${numeral})`, parent_number: "36", text: `part ${numeral}` })
        ),
      },
    ]);
    expect(result.map((r) => r.displayNumber)).toEqual([
      "36 (i)",
      "36 (ii)",
      "36 (iii)",
      "36 (iv)",
      "36 (v)",
    ]);
  });
});
