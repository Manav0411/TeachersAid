import { subPartIndex } from "@/lib/roman";

/**
 * Label canonicalisation. Strips question/answer prefix words and
 * punctuation, then unifies roman numerals and letters onto one scale so
 * "11(a)", "Ans 11 A", and "11-i" all compare equal.
 *
 *   canonicalizeLabel("Q.11(a)")  -> { major: 11, sub: "a" }
 *   canonicalizeLabel("Ans 11 A") -> { major: 11, sub: "a" }
 *   canonicalizeLabel("11-i")     -> { major: 11, sub: "a" }  // roman i -> 1st -> "a"
 *
 * Every recognised sub-token (not just the last) feeds into `sub`, joined
 * in order — this disambiguates nested sub-parts that share a trailing
 * marker: "24(a)(i)" -> { major: 24, sub: "a-a" } vs "24(b)(i)" ->
 * { major: 24, sub: "b-a" }. A single sub-token still collapses to a
 * single letter exactly as before, so the common one-level case
 * ("11(a)", "11-i") is unaffected.
 */

const PREFIX_WORDS = new Set([
  "q",
  "qn",
  "ques",
  "question",
  "ans",
  "answer",
  "sol",
  "soln",
]);

export type CanonicalLabel = { major: number | null; sub: string | null };

function indexToLetter(n: number): string {
  return String.fromCharCode("a".charCodeAt(0) + n - 1);
}

export function canonicalizeLabel(raw: string | null | undefined): CanonicalLabel | null {
  if (!raw) return null;
  const tokens = raw.match(/[A-Za-z]+|[0-9]+/g) ?? [];

  let major: number | null = null;
  const subIndices: number[] = [];

  for (const token of tokens) {
    if (/^[0-9]+$/.test(token)) {
      if (major === null) major = parseInt(token, 10);
      else subIndices.push(parseInt(token, 10));
      continue;
    }

    const lower = token.toLowerCase();
    if (PREFIX_WORDS.has(lower)) continue;

    const idx = subPartIndex(token);
    if (idx !== null) subIndices.push(idx);
    // Unrecognised multi-letter word — ignore rather than corrupt the key.
  }

  if (major === null && subIndices.length === 0) return null;
  const sub = subIndices.length > 0 ? subIndices.map(indexToLetter).join("-") : null;
  return { major, sub };
}

export function labelKey(c: CanonicalLabel): string {
  return `${c.major ?? ""}:${c.sub ?? ""}`;
}

/** True when two labels canonicalise to the exact same (major, sub) pair. */
export function labelsMatch(a: string | null, b: string | null): boolean {
  const ca = canonicalizeLabel(a);
  const cb = canonicalizeLabel(b);
  if (!ca || !cb) return false;
  return labelKey(ca) === labelKey(cb);
}

/** True when `label` names only the parent question (e.g. "11") while the
 * paper has lettered sub-parts ("11(a)", "11(b)"). */
export function isParentOnlyLabel(label: string | null): boolean {
  const c = canonicalizeLabel(label);
  return c !== null && c.major !== null && c.sub === null;
}
