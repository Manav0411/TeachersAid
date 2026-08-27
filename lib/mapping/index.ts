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

/**
 * Runs the full deterministic-then-semantic mapping pipeline: exact label
 * match, parent-label split, one LLM call for the residue, then positional
 * narrowing. Manual override lives in the session reducer, not here — this
 * function only produces the machine's first pass.
 */
export async function runMappingEngine(
  questions: Question[],
  segments: AnswerSegment[]
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

  // --- Step B: exact label match ---------------------------------------
  const byCanonicalLabel = new Map<string, AnswerSegment[]>();
  for (const seg of segments) {
    const c = canonicalizeLabel(seg.detectedLabel);
    if (!c || c.sub === null) continue; // parent-only / unlabeled -> steps C/D
    const key = labelKey(c);
    if (!byCanonicalLabel.has(key)) byCanonicalLabel.set(key, []);
    byCanonicalLabel.get(key)!.push(seg);
  }

  for (const q of questions) {
    const c = canonicalizeLabel(q.displayNumber);
    if (!c) continue;
    const matches = byCanonicalLabel.get(labelKey(c));
    if (!matches || matches.length === 0) continue;

    // Clean segment wins; a struck-through duplicate stays attached as a
    // secondary, greyed by the UI (e.g. the same question answered twice).
    const ordered = [...matches].sort(
      (a, b) => Number(a.isStruckThrough) - Number(b.isStruckThrough)
    );
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
  const semanticMatches = await semanticMatch(residueQuestions, residueSegments);

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
