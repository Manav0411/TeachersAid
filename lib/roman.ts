/**
 * Roman numeral / letter-index helpers shared by question sort-key parsing
 * (lib/questions/reconcile.ts) and label canonicalisation (lib/mapping/labels.ts).
 * A bare single character — "i", "v", "x", "l", "c", "d", "m" — is
 * genuinely ambiguous between a roman numeral and a lettered sub-part
 * ("24(c)" could be the 3rd of a-b-c-d-e-f, or roman C=100). Neither a
 * fixed roman-first nor letter-first default is correct on its own: both
 * conventions are common, and a roman sequence's very first sub-part is
 * literally the ambiguous character "i". Callers with sibling context
 * (a whole sub-part group, not just one token) should use
 * `groupPrefersRoman` to decide once per group, then pass that as
 * `preferRoman` to every ambiguous token in the group — see
 * reconcile.ts's and mapping/index.ts's grouping passes.
 */

const ROMAN_VALUES: Record<string, number> = {
  I: 1,
  V: 5,
  X: 10,
  L: 50,
  C: 100,
  D: 500,
  M: 1000,
};

const VALID_ROMAN = /^(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))$/i;

/** True only for a well-formed roman numeral (I, II, III, IV, ... up to a few thousand). */
export function isRomanNumeral(token: string): boolean {
  if (!token) return false;
  const upper = token.toUpperCase();
  return upper.length > 0 && VALID_ROMAN.test(upper) && upper !== "";
}

// Single letters that are also roman numerals.
export const AMBIGUOUS_ROMAN_LETTERS = new Set(["i", "v", "x", "l", "c", "d", "m"]);

/**
 * Resolves a single- or multi-character sub-part token to a 1-based index.
 * A multi-character token is unambiguous — it's always tried as roman
 * first (letter tokens are never more than one character). A single
 * ambiguous character resolves per `preferRoman`, which callers with
 * sibling context should derive via `groupPrefersRoman` rather than
 * hardcode; isolated callers keep the historical roman-first default.
 * Returns null for anything unrecognised.
 */
export function subPartIndex(token: string, preferRoman = true): number | null {
  if (token.length > 1 && isRomanNumeral(token)) return romanToInt(token);
  if (token.length === 1) {
    const lower = token.toLowerCase();
    if (AMBIGUOUS_ROMAN_LETTERS.has(lower) && preferRoman) return romanToInt(token);
    return letterToIndex(token);
  }
  return null;
}

/**
 * Decides whether a sibling group of sub-part marker tokens (e.g. every
 * "(a)"/"(b)"/"(c)"... under the same parent question) uses roman-numeral
 * or plain-letter convention: true iff the group contains at least one
 * *unambiguous* multi-character roman token ("ii", "iii", "iv", ...).
 * With no such evidence, letter mode wins — the common case a fixed
 * roman-first default gets wrong (a real a-b-c-d-e-f sequence has no
 * multi-char roman token anywhere in it).
 */
export function groupPrefersRoman(tokens: string[]): boolean {
  return tokens.some((t) => t.length > 1 && isRomanNumeral(t));
}

export function romanToInt(token: string): number {
  const upper = token.toUpperCase();
  let total = 0;
  for (let i = 0; i < upper.length; i++) {
    const curr = ROMAN_VALUES[upper[i]];
    const next = ROMAN_VALUES[upper[i + 1]];
    if (next && curr < next) {
      total -= curr;
    } else {
      total += curr;
    }
  }
  return total;
}

/** a/A -> 1, b/B -> 2, ... single-letter sub-part index. */
export function letterToIndex(token: string): number | null {
  if (!/^[a-zA-Z]$/.test(token)) return null;
  return token.toLowerCase().charCodeAt(0) - "a".charCodeAt(0) + 1;
}
