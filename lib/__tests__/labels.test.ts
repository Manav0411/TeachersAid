import { describe, expect, it } from "vitest";
import { canonicalizeLabel, isParentOnlyLabel, labelsMatch } from "@/lib/mapping/labels";

describe("canonicalizeLabel", () => {
  it("parses 'Q.11(a)'", () => {
    expect(canonicalizeLabel("Q.11(a)")).toEqual({ major: 11, sub: "a" });
  });

  it("parses 'Ans 11 A'", () => {
    expect(canonicalizeLabel("Ans 11 A")).toEqual({ major: 11, sub: "a" });
  });

  it("parses '11-i' as roman i -> 1st -> 'a'", () => {
    expect(canonicalizeLabel("11-i")).toEqual({ major: 11, sub: "a" });
  });

  it("handles 'iv' and 'vi' correctly (not letter-by-letter)", () => {
    expect(canonicalizeLabel("12(iv)")).toEqual({ major: 12, sub: "d" }); // iv=4 -> 'd'
    expect(canonicalizeLabel("12(vi)")).toEqual({ major: 12, sub: "f" }); // vi=6 -> 'f'
  });

  it("strips ans/answer/sol/soln/q/qn/ques/question prefixes", () => {
    expect(canonicalizeLabel("Answer 7")).toEqual({ major: 7, sub: null });
    expect(canonicalizeLabel("Soln. 7(b)")).toEqual({ major: 7, sub: "b" });
    expect(canonicalizeLabel("Ques 7")).toEqual({ major: 7, sub: null });
  });

  it("returns null for unparseable input", () => {
    expect(canonicalizeLabel("rough work")).toBeNull();
    expect(canonicalizeLabel(null)).toBeNull();
    expect(canonicalizeLabel("")).toBeNull();
  });

  it("labelsMatch is order-independent of formatting", () => {
    expect(labelsMatch("Q.11(a)", "Ans 11 A")).toBe(true);
    expect(labelsMatch("11(a)", "11(b)")).toBe(false);
  });

  it("isParentOnlyLabel is true only for a bare major number", () => {
    expect(isParentOnlyLabel("11")).toBe(true);
    expect(isParentOnlyLabel("Q.11")).toBe(true);
    expect(isParentOnlyLabel("11(a)")).toBe(false);
  });
});
