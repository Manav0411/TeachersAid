import type { Question } from "@/lib/types";
import type { RawQuestion } from "@/lib/schemas";
import { toBBox } from "@/lib/boxes";
import { subPartIndex } from "@/lib/roman";

const PREFIX_WORDS = new Set(["q", "qn", "ques", "question"]);

/**
 * Parse a display_number like "11 (a)", "Q.3", "(iii)" into a sortable
 * key array, e.g. [11, 1] or [3]. Falls back to `fallback` (page/vertical
 * order) when nothing parseable is found.
 */
export function parseSortKey(displayNumber: string, fallback: number[]): number[] {
  const tokens = displayNumber.match(/[A-Za-z]+|[0-9]+/g) ?? [];
  const nums: number[] = [];

  for (const token of tokens) {
    if (/^[0-9]+$/.test(token)) {
      nums.push(parseInt(token, 10));
      continue;
    }
    if (PREFIX_WORDS.has(token.toLowerCase())) continue;

    const idx = subPartIndex(token);
    if (idx !== null) nums.push(idx);
    // Unparseable stray word — ignore it rather than corrupt the key.
  }

  return nums.length > 0 ? nums : fallback;
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

function normaliseOne(
  raw: RawQuestion,
  pageIndex: number,
  section: string | null,
  orderInPage: number
): WorkingQuestion {
  return {
    id: "", // assigned after dedupe, once we know the final display_number
    displayNumber: raw.display_number,
    sortKey: parseSortKey(raw.display_number, [pageIndex * 1000 + orderInPage]),
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
