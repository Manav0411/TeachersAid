import { isRomanNumeral, letterToIndex, romanToInt } from "@/lib/roman";

/**
 * Label canonicalisation. Strips question/answer prefix words and
 * punctuation, then unifies roman numerals and letters onto one scale so
 * "11(a)", "Ans 11 A", and "11-i" all compare equal.
 *
 *   canonicalizeLabel("Q.11(a)")  -> { major: 11, sub: "a" }
 *   canonicalizeLabel("Ans 11 A") -> { major: 11, sub: "a" }
 *   canonicalizeLabel("11-i")     -> { major: 11, sub: "a" }  // roman i -> 1st -> "a"
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

// Single letters that are also roman numerals (i, v, x, l, c, d, m) are
// overwhelmingly used as roman sub-part labels in practice — a lettered
// sub-part sequence goes a, b, c, d, e, not jumps to "v" — so treat these
// as roman by default. Longer tokens are only roman if unambiguously so.
const AMBIGUOUS_ROMAN_LETTERS = new Set(["i", "v", "x", "l", "c", "d", "m"]);

export type CanonicalLabel = { major: number | null; sub: string | null };

function indexToLetter(n: number): string {
  return String.fromCharCode("a".charCodeAt(0) + n - 1);
}

export function canonicalizeLabel(raw: string | null | undefined): CanonicalLabel | null {
  if (!raw) return null;
  const tokens = raw.match(/[A-Za-z]+|[0-9]+/g) ?? [];

  let major: number | null = null;
  let subValue: number | null = null;

  for (const token of tokens) {
    if (/^[0-9]+$/.test(token)) {
      if (major === null) major = parseInt(token, 10);
      else if (subValue === null) subValue = parseInt(token, 10);
      continue;
    }

    const lower = token.toLowerCase();
    if (PREFIX_WORDS.has(lower)) continue;

    if (token.length > 1 && isRomanNumeral(token)) {
      subValue = romanToInt(token);
      continue;
    }
    if (token.length === 1) {
      if (AMBIGUOUS_ROMAN_LETTERS.has(lower)) {
        subValue = romanToInt(token);
      } else {
        const idx = letterToIndex(token);
        if (idx !== null) subValue = idx;
      }
      continue;
    }
    // Unrecognised multi-letter word — ignore rather than corrupt the key.
  }

  if (major === null && subValue === null) return null;
  return { major, sub: subValue !== null ? indexToLetter(subValue) : null };
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
