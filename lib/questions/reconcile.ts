import type { Question } from "@/lib/types";
import type { RawQuestion } from "@/lib/schemas";
import { toBBox } from "@/lib/boxes";
import { subPartIndex, groupPrefersRoman } from "@/lib/roman";
import { canonicalizeLabel } from "@/lib/mapping/labels";

const PREFIX_WORDS = new Set(["q", "qn", "ques", "question"]);

/**
 * Parse a display_number like "11 (a)", "Q.3", "(iii)" into a sortable
 * key array, e.g. [11, 1] or [3]. Falls back to `fallback` (page/vertical
 * order) when nothing parseable is found. `preferRoman` disambiguates a
 * bare ambiguous sub-part character ("c", "v", ...) — pass the sibling
 * group's resolved mode (`romanModeByParent`) when known; isolated
 * callers keep the historical roman-first default.
 */
export function parseSortKey(
  displayNumber: string,
  fallback: number[],
  preferRoman = true
): number[] {
  const tokens = displayNumber.match(/[A-Za-z]+|[0-9]+/g) ?? [];
  const nums: number[] = [];

  for (const token of tokens) {
    if (/^[0-9]+$/.test(token)) {
      nums.push(parseInt(token, 10));
      continue;
    }
    if (PREFIX_WORDS.has(token.toLowerCase())) continue;

    const idx = subPartIndex(token, preferRoman);
    if (idx !== null) nums.push(idx);
    // Unparseable stray word — ignore it rather than corrupt the key.
  }

  return nums.length > 0 ? nums : fallback;
}

/** Just the sub-part marker tokens of a display number (e.g. "24(c)" ->
 * ["c"]) — the alphabetic tokens `parseSortKey` would resolve via
 * `subPartIndex`, extracted on their own for group-level roman/letter
 * mode detection. */
function subPartTokens(displayNumber: string): string[] {
  const tokens = displayNumber.match(/[A-Za-z]+|[0-9]+/g) ?? [];
  return tokens.filter((t) => !/^[0-9]+$/.test(t) && !PREFIX_WORDS.has(t.toLowerCase()));
}

/** A question's own leading major number, roman-agnostic (digits are
 * never ambiguous) — used as the sibling-group key when a question has
 * no explicit `parentNumber` of its own (e.g. an OR-choice question like
 * "24(a)(i)" that isn't a child of some other "24", but still has its
 * own further ambiguous sub-tokens). Exported so lib/mapping/index.ts's
 * segment-side lookup (which only ever has a raw label, never a
 * `parentNumber`) can resolve to the exact same group key. */
export function groupKeyFor(displayNumber: string, parentNumber?: string): string {
  if (parentNumber) return parentNumber;
  return displayNumber.match(/[0-9]+/)?.[0] ?? "";
}

/**
 * Decides roman-vs-letter mode per sibling group — see `groupKeyFor` for
 * the grouping key and `groupPrefersRoman` in lib/roman.ts for why this
 * can't be decided per-token in isolation. A group with only one member
 * has no sibling evidence either way and keeps the historical
 * roman-first default. Exported so the mapping engine
 * (lib/mapping/index.ts) can recompute the identical mode from the same
 * resolved `Question[]` it already receives, keeping display order and
 * label matching consistent without threading a new field through the
 * `Question` type.
 */
export function romanModeByParent(
  questions: { parentNumber?: string; displayNumber: string }[]
): Map<string, boolean> {
  const groups = new Map<string, { count: number; tokens: string[] }>();
  for (const q of questions) {
    const key = groupKeyFor(q.displayNumber, q.parentNumber);
    const entry = groups.get(key) ?? { count: 0, tokens: [] };
    entry.count += 1;
    entry.tokens.push(...subPartTokens(q.displayNumber));
    groups.set(key, entry);
  }
  const mode = new Map<string, boolean>();
  for (const [key, { count, tokens }] of groups) {
    mode.set(key, count <= 1 ? true : groupPrefersRoman(tokens));
  }
  return mode;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

type PageQuestions = {
  pageIndex: number;
  section: string | null;
  questions: RawQuestion[];
};

type WorkingQuestion = Question & {
  continuesOnNextPage: boolean;
  continuesFromPreviousPage: boolean;
};

/**
 * A sub-part's own printed marker ("(i)", "(a)") can be bare, relying on
 * a parent number the model captured separately in `parent_number`
 * ("24", or "24(b)" for a further-nested OR-choice part). Combining them
 * here — once, before id/sortKey/canonicalisation all derive from
 * displayNumber — is what lets a bare "(i)" resolve to its actual full
 * identity instead of silently losing the parent context. Guards against
 * double-prefixing when the model already repeated the parent inline.
 */
function withParentNumber(displayNumber: string, parentNumber: string | null): string {
  if (!parentNumber) return displayNumber;
  const trimmedParent = parentNumber.trim();
  const trimmedDisplay = displayNumber.trim();
  if (!trimmedParent) return trimmedDisplay;
  if (trimmedDisplay.toLowerCase().startsWith(trimmedParent.toLowerCase())) {
    return trimmedDisplay;
  }
  return `${trimmedParent} ${trimmedDisplay}`;
}

function normaliseOne(
  raw: RawQuestion,
  pageIndex: number,
  section: string | null,
  orderInPage: number
): WorkingQuestion {
  const displayNumber = withParentNumber(raw.display_number, raw.parent_number);
  return {
    id: "", // assigned after dedupe, once we know the final display_number
    displayNumber,
    sortKey: parseSortKey(displayNumber, [pageIndex * 1000 + orderInPage]),
    parentNumber: raw.parent_number ?? undefined,
    text: raw.text,
    options: raw.options?.map((o) => ({ label: o.label, text: o.text })) ?? undefined,
    marks: raw.marks ?? undefined,
    type: raw.type,
    section: section ?? undefined,
    instruction: raw.instruction ?? undefined,
    pageIndex,
    bbox: raw.box_2d ? toBBox(raw.box_2d) : undefined,
    continuesOnNextPage: raw.continues_on_next_page,
    continuesFromPreviousPage: raw.continues_from_previous_page,
  };
}

/** Loose equality for "the numbers agree" when stitching a page-break split. */
function numbersAgree(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(a) === norm(b) || norm(b) === "";
}

/**
 * Reconcile raw per-page question extractions into the final ordered
 * Question[]: stitch page-break splits, dedupe, assign stable ids.
 */
export function reconcileQuestions(pages: PageQuestions[]): Question[] {
  const sortedPages = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);

  const flat: WorkingQuestion[] = sortedPages.flatMap((page) =>
    page.questions.map((raw, i) => normaliseOne(raw, page.pageIndex, page.section, i))
  );

  // Backfill a bare sub-part's missing parent number from its immediately
  // preceding sibling, in printed order. Live-observed: the model
  // extracts each page independently, so a sub-part landing right at a
  // page boundary sometimes loses the parent_number its siblings on the
  // same page carried (e.g. "(a)"/"(b)" both get "24(b)", but a trailing
  // "(c)" on the next page comes back with parent_number: null). Only
  // fires for a genuinely bare marker (no major number of its own);
  // resets once a question with its own major number appears, so it
  // never leaks across into an unrelated question.
  let inheritedParent: string | undefined;
  for (const q of flat) {
    if (!q.parentNumber) {
      const canon = canonicalizeLabel(q.displayNumber);
      if (canon?.major === null && inheritedParent) {
        q.parentNumber = inheritedParent;
        q.displayNumber = withParentNumber(q.displayNumber, inheritedParent);
        q.sortKey = parseSortKey(q.displayNumber, q.sortKey);
      }
    }
    if (q.parentNumber) {
      inheritedParent = q.parentNumber;
    } else if (canonicalizeLabel(q.displayNumber)?.major !== null) {
      inheritedParent = undefined;
    }
  }

  // Stitch: merge a question that continues onto the next page into the
  // first question on that next page, when the numbers agree (or the
  // continuation has no distinguishing number of its own).
  const stitched: WorkingQuestion[] = [];
  for (const q of flat) {
    const prev = stitched[stitched.length - 1];
    if (
      prev &&
      prev.continuesOnNextPage &&
      q.continuesFromPreviousPage &&
      q.pageIndex === prev.pageIndex + 1 &&
      numbersAgree(prev.displayNumber, q.displayNumber)
    ) {
      prev.text = `${prev.text.trim()} ${q.text.trim()}`.trim();
      prev.continuesOnNextPage = q.continuesOnNextPage;
      continue;
    }
    stitched.push({ ...q });
  }

  // Dedupe by (section, display_number), keeping the first occurrence.
  const seen = new Set<string>();
  const deduped = stitched.filter((q) => {
    const key = `${q.section ?? ""}::${q.displayNumber.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Assign stable ids now that the final set is known.
  const idCounts = new Map<string, number>();
  for (const q of deduped) {
    const base = slugify(`${q.section ?? "q"}-${q.displayNumber}`) || "q";
    const count = idCounts.get(base) ?? 0;
    idCounts.set(base, count + 1);
    q.id = count === 0 ? base : `${base}-${count}`;
  }

  // Resolve roman-vs-letter ambiguity per sibling group now that parent
  // numbers are settled and dedup is final — see groupPrefersRoman in
  // lib/roman.ts for why a single ambiguous character can't be resolved
  // per-token in isolation (a real a-b-c-d-e-f sequence needs letter
  // mode; a real i-ii-iii-iv-v sequence needs roman mode).
  const romanMode = romanModeByParent(deduped);
  for (const q of deduped) {
    const mode = romanMode.get(groupKeyFor(q.displayNumber, q.parentNumber)) ?? true;
    q.sortKey = parseSortKey(q.displayNumber, q.sortKey, mode);
  }

  // Final sort: printed order via sortKey, tie-broken by page/discovery order.
  deduped.sort((a, b) => {
    const len = Math.max(a.sortKey.length, b.sortKey.length);
    for (let i = 0; i < len; i++) {
      const av = a.sortKey[i] ?? -Infinity;
      const bv = b.sortKey[i] ?? -Infinity;
      if (av !== bv) return av - bv;
    }
    return a.pageIndex - b.pageIndex;
  });

  return deduped.map((q): Question => ({
    id: q.id,
    displayNumber: q.displayNumber,
    sortKey: q.sortKey,
    parentNumber: q.parentNumber,
    text: q.text,
    options: q.options,
    marks: q.marks,
    type: q.type,
    section: q.section,
    instruction: q.instruction,
    pageIndex: q.pageIndex,
    bbox: q.bbox,
  }));
}
