import type { AnswerSegment, Mapping, Question } from "@/lib/types";
import { canonicalizeLabel, isParentOnlyLabel, labelKey } from "./labels";
import { semanticMatch } from "./semantic";
import { positionalNarrow } from "./positional";

const CONFIDENCE_THRESHOLD = 0.55;

/**
 * Detects embedded sub-part markers ("(a)", "(b)", "(i)", "(ii)") at the
 * start of lines within a transcript, and splits it into per-marker chunks.
 * Used by step C when a segment labelled only with the parent number ("11")
 * actually contains multiple children's answers run together.
 */
function splitByInternalLabels(
  transcript: string
): { label: string; text: string }[] | null {
  const lines = transcript.split(/\n+/);
  const markerRe = /^\s*[([]?\s*([a-zA-Z]{1,3}|[ivxlcdmIVXLCDM]{1,4})\s*[)\].:]/;
  const markers: { label: string; startLine: number }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(markerRe);
    if (m) markers.push({ label: m[1], startLine: i });
  });
  if (markers.length < 2) return null;

  return markers.map((marker, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].startLine : lines.length;
    return {
      label: marker.label,
      text: lines.slice(marker.startLine, end).join("\n").trim(),
    };
  });
}

export type MappingResult = { mappings: Mapping[]; derivedSegments: AnswerSegment[] };

const ROUGH_WORK_PREFIX = /^\s*\[rough work\]/i;

/** True for a segment the extraction prompt flagged as rough work / margin
 * notes (lib/prompts/answers.ts rule 5) — these must never be mapped to a
 * question or graded, only surfaced for visibility. */
function isRoughWork(seg: AnswerSegment): boolean {
  return ROUGH_WORK_PREFIX.test(seg.transcript);
}

/**
 * Runs the full deterministic-then-semantic mapping pipeline: exact label
 * match, parent-label split, one LLM call for the residue, then positional
 * narrowing. Manual override lives in the session reducer, not here — this
 * function only produces the machine's first pass.
 */
export async function runMappingEngine(
  allQuestions: Question[],
  allSegments: AnswerSegment[],
  opts: { onRetry?: (err: unknown) => void } = {}
): Promise<MappingResult> {
  const mappings: Mapping[] = [];
  const claimedQuestionIds = new Set<string>();
  const claimedSegmentIds = new Set<string>();
  const derivedSegments: AnswerSegment[] = [];

  function claim(mapping: Mapping) {
    mappings.push(mapping);
    if (mapping.questionId) claimedQuestionIds.add(mapping.questionId);
    mapping.segmentIds.forEach((id) => claimedSegmentIds.add(id));
  }

  // --- Step 0: exclude rough work / margin notes from mapping entirely ---
  // (edge case: "Rough work in a margin ... never mapped, excluded from
  // grading"). These still show up in the Unmatched-answers tray below for
  // visibility/manual override, but the algorithm never guesses a question
  // for them — a still-open positional-narrowing gap otherwise force-
  // assigns any leftover segment to the sole remaining unanswered question.
  const questions = allQuestions;
  const segments = allSegments.filter((s) => !isRoughWork(s));
  for (const seg of allSegments) {
    if (isRoughWork(seg)) {
      claim({
        questionId: null,
        segmentIds: [seg.id],
        status: "unmatched",
        method: "label",
        confidence: 0,
        rationale: "Rough work — excluded from mapping",
      });
    }
  }

  // --- Step B: exact label match ---------------------------------------
  // A segment's canonical label can have sub: null for two very different
  // reasons: (1) the question paper simply doesn't use sub-parts for that
  // number — by far the common case, and an exact match here is exactly
  // right — or (2) the segment names only a parent that DOES have lettered
  // children ("11" on a paper with 11(a)/11(b)). Case (2) resolves itself:
  // no question's own canonical key is bare "11" when only its sub-parts
  // exist, so the lookup below simply won't find a match and the segment
  // falls through untouched to step C. Excluding sub:null segments here
  // outright — as an earlier version of this code did — silently skipped
  // exact matching for every plain-numbered answer on a paper with no
  // sub-parts at all, which is the single most common case.
  const byCanonicalLabel = new Map<string, AnswerSegment[]>();
  for (const seg of segments) {
    const c = canonicalizeLabel(seg.detectedLabel);
    if (!c) continue; // no label at all -> steps C/D
    const key = labelKey(c);
    if (!byCanonicalLabel.has(key)) byCanonicalLabel.set(key, []);
    byCanonicalLabel.get(key)!.push(seg);
  }

  for (const q of questions) {
    const c = canonicalizeLabel(q.displayNumber);
    if (!c) continue;
    const matches = byCanonicalLabel.get(labelKey(c));
    if (!matches || matches.length === 0) continue;

    // Multiple segments sharing one label are only safe to concatenate
    // when at least one is struck through — the genuine "answered twice"
    // case (edge case #8). When ≥2 *clean* segments share a label, that's
    // extraction ambiguity (e.g. the model attributing a nearby label to
    // an unlabeled block that follows it closely), not a duplicate attempt
    // — concatenating them would silently swallow what's likely a
    // different question's answer. Claim only the first clean one in
    // reading order here and leave the rest for steps D/E to resolve
    // independently, rather than guessing they belong together.
    const struckThrough = matches.filter((s) => s.isStruckThrough);
    const clean = matches.filter((s) => !s.isStruckThrough);
    const claimed = clean.length > 1 ? clean.slice(0, 1) : clean;
    const ordered = [...claimed, ...struckThrough];

    claim({
      questionId: q.id,
      segmentIds: ordered.map((s) => s.id),
      status: "answered",
      method: "label",
      confidence: 0.97,
    });
  }

  // --- Step C: parent-only labels ---------------------------------------
  const parentOnlySegments = segments.filter(
    (s) => !claimedSegmentIds.has(s.id) && isParentOnlyLabel(s.detectedLabel)
  );
  for (const seg of parentOnlySegments) {
    const c = canonicalizeLabel(seg.detectedLabel)!;
    const children = questions.filter((q) => {
      const qc = canonicalizeLabel(q.displayNumber);
      return qc?.major === c.major && qc.sub !== null && !claimedQuestionIds.has(q.id);
    });
    if (children.length === 0) continue;

    const split = splitByInternalLabels(seg.transcript);
    if (split) {
      let matchedAny = false;
      for (const chunk of split) {
        const chunkCanonical = canonicalizeLabel(`${c.major}${chunk.label}`);
        const child = children.find(
          (q) => canonicalizeLabel(q.displayNumber)?.sub === chunkCanonical?.sub
        );
        if (!child) continue;
        const derived: AnswerSegment = {
          ...seg,
          id: `${seg.id}-split-${chunk.label}`,
          transcript: chunk.text,
          detectedLabel: `${c.major}${chunk.label}`,
        };
        derivedSegments.push(derived);
        claim({
          questionId: child.id,
          segmentIds: [derived.id],
          status: "answered",
          method: "label",
          confidence: 0.75,
          rationale: "Split from a parent-labelled segment by internal sub-labels",
        });
        matchedAny = true;
      }
      if (matchedAny) {
        claimedSegmentIds.add(seg.id); // superseded by its splits
        continue;
      }
    }
    // No internal markers found — fall through to the semantic residue,
    // which will pick whichever child fits best, without a dedicated LLM
    // call per parent-only segment.
  }

  // --- Step D: semantic match for the residue ---------------------------
  const residueSegments = segments.filter((s) => !claimedSegmentIds.has(s.id));
  const residueQuestions = questions.filter((q) => !claimedQuestionIds.has(q.id));
  const semanticMatches = await semanticMatch(residueQuestions, residueSegments, opts);

  const sortedMatches = [...semanticMatches].sort((a, b) => b.confidence - a.confidence);
  for (const m of sortedMatches) {
    if (!m.questionId) continue;
    if (claimedSegmentIds.has(m.answerId) || claimedQuestionIds.has(m.questionId)) continue;
    if (m.confidence < CONFIDENCE_THRESHOLD) continue;
    claim({
      questionId: m.questionId,
      segmentIds: [m.answerId],
      status: "answered",
      method: "semantic",
      confidence: m.confidence,
      rationale: m.reason,
    });
  }

  // --- Step E: positional narrowing --------------------------------------
  const segmentOrder = [...segments]
    .sort((a, b) => {
      const ra = a.regions[0];
      const rb = b.regions[0];
      if (!ra || !rb) return 0;
      if (ra.pageIndex !== rb.pageIndex) return ra.pageIndex - rb.pageIndex;
      return ra.bbox.y - rb.bbox.y;
    })
    .map((s) => s.id);

  const matchedQuestionForSegment = new Map<string, string>();
  for (const m of mappings) {
    if (m.questionId) {
      for (const id of m.segmentIds) matchedQuestionForSegment.set(id, m.questionId);
    }
  }

  const stillUnmatchedIds = segments
    .filter((s) => !claimedSegmentIds.has(s.id))
    .map((s) => s.id);
  const positional = positionalNarrow(
    stillUnmatchedIds,
    segmentOrder,
    matchedQuestionForSegment,
    questions.filter((q) => !claimedQuestionIds.has(q.id))
  );
  for (const [segId, { questionId, confidence }] of positional) {
    if (claimedQuestionIds.has(questionId) || claimedSegmentIds.has(segId)) continue;
    claim({
      questionId,
      segmentIds: [segId],
      status: "answered",
      method: "positional",
      confidence,
    });
  }

  // --- Step F: finalise ---------------------------------------------------
  for (const q of questions) {
    if (!claimedQuestionIds.has(q.id)) {
      mappings.push({
        questionId: q.id,
        segmentIds: [],
        status: "unanswered",
        method: "label",
        confidence: 0,
      });
    }
  }
  for (const seg of [...segments, ...derivedSegments]) {
    if (!claimedSegmentIds.has(seg.id)) {
      mappings.push({
        questionId: null,
        segmentIds: [seg.id],
        status: "unmatched",
        method: "semantic",
        confidence: 0,
      });
    }
  }

  return { mappings, derivedSegments };
}

/**
 * Asserts the core invariant: every Question appears in exactly one
 * Mapping, and every AnswerSegment id appears in at most one Mapping.
 * Logs violations; does not throw — a violated invariant should be
 * visible, not fatal, so one bad page never takes down the whole run.
 */
export function validateMappings(
  questions: Question[],
  segments: AnswerSegment[],
  mappings: Mapping[]
): boolean {
  let valid = true;

  const questionOccurrences = new Map<string, number>();
  for (const m of mappings) {
    if (!m.questionId) continue;
    questionOccurrences.set(m.questionId, (questionOccurrences.get(m.questionId) ?? 0) + 1);
  }
  for (const q of questions) {
    const count = questionOccurrences.get(q.id) ?? 0;
    if (count !== 1) {
      console.warn(`[validateMappings] question ${q.id} appears in ${count} mappings (expected 1)`);
      valid = false;
    }
  }

  const segmentOccurrences = new Map<string, number>();
  for (const m of mappings) {
    for (const segId of m.segmentIds) {
      segmentOccurrences.set(segId, (segmentOccurrences.get(segId) ?? 0) + 1);
    }
  }
  for (const seg of segments) {
    const count = segmentOccurrences.get(seg.id) ?? 0;
    if (count > 1) {
      console.warn(`[validateMappings] segment ${seg.id} appears in ${count} mappings (expected ≤1)`);
      valid = false;
    }
  }

  return valid;
}

export { canonicalizeLabel, isParentOnlyLabel, labelKey } from "./labels";
