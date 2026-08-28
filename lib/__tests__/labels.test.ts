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

  it("disambiguates nested sub-parts that share a trailing marker (regression)", () => {
    // Live-observed root cause: an OR-choice question ("24(a)..." /
    // "24(b)...") each further broken into roman sub-points ("(i)",
    // "(ii)") used to collapse onto the SAME canonical key, since only
    // the trailing token survived — "24(a)(i)" and "24(b)(i)" both
    // canonicalised to { major: 24, sub: "a" }. Every recognised
    // sub-token must now contribute, so nesting is preserved.
    expect(canonicalizeLabel("24(a)(i)")).toEqual({ major: 24, sub: "a-a" });
    expect(canonicalizeLabel("24(b)(i)")).toEqual({ major: 24, sub: "b-a" });
    expect(canonicalizeLabel("24(a)(i)")).not.toEqual(canonicalizeLabel("24(b)(i)"));
    // Single-level labels are unaffected by the multi-token change.
    expect(canonicalizeLabel("24(a)")).toEqual({ major: 24, sub: "a" });
  });

  it("preferRoman disambiguates an ambiguous single character on demand", () => {
    // Default (no second arg) preserves the historical roman-first
    // behavior — existing callers/tests are unaffected.
    expect(canonicalizeLabel("11-i")).toEqual({ major: 11, sub: "a" });
    // Explicit letter mode reads an ambiguous "c" as the 3rd letter
    // instead of roman C=100 — this is the fix: a lettered sibling group
    // (a,b,c,d...) resolves correctly once callers pass their group's mode.
    expect(canonicalizeLabel("11-c", false)).toEqual({ major: 11, sub: "c" });
    // The exact collision the bug allowed: an unambiguous letter "e"
    // (always index 5) and an ambiguous "v" read as roman (also index 5)
    // land on the identical canonical key unless "v" is read in its
    // group's real (letter) mode.
    expect(canonicalizeLabel("e")).toEqual({ major: null, sub: "e" });
    expect(canonicalizeLabel("v", true)).toEqual({ major: null, sub: "e" }); // the collision
    expect(canonicalizeLabel("v", false)).toEqual({ major: null, sub: "v" }); // resolved: v is the 22nd letter
  });
});
