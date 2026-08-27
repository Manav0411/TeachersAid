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
});
