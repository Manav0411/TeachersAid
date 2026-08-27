/**
 * Roman numeral / letter-index helpers shared by question sort-key parsing
 * (lib/questions/reconcile.ts) and label canonicalisation (lib/mapping/labels.ts).
 * PRD §6.2 and §6.4 both need "roman parse before letter parse" — a bare
 * "i" or "v" is ambiguous between a roman numeral and a lettered sub-part,
 * so callers decide which to try first based on context.
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
