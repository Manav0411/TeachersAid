import type { AnswerSegment } from "@/lib/types";
import type { RawAnswerSegment } from "@/lib/schemas";
import { mergeLineBoxes, sanitiseBBoxes, toBBox } from "@/lib/boxes";

/**
 * Converts one page's raw model segments into domain AnswerSegments, with
 * boxes merged into ≤4 clean regions and sanity-filtered (PRD §6.3
 * post-processing #1, #2, #4). Ink-tightening (#3) is applied separately in
 * the browser once the page raster is available — see lib/boxes.client.ts.
 */
function normaliseOne(seg: RawAnswerSegment, pageIndex: number, i: number): AnswerSegment {
  const lineBoxes = seg.line_boxes.map(toBBox);
  const merged = sanitiseBBoxes(mergeLineBoxes(lineBoxes));
  const regions = merged.map((bbox) => ({ pageIndex, bbox }));

  return {
    id: `seg-p${pageIndex}-${i}`,
    detectedLabel: seg.detected_label,
    transcript: seg.transcript,
    regions,
    isContinuation: seg.is_continuation,
    isStruckThrough: seg.is_struck_through,
    legibility: seg.legibility,
    confidence: seg.confidence,
  };
}

export type PageSegments = { pageIndex: number; raw: RawAnswerSegment[] };

/**
 * Normalises every page's raw segments and applies the cross-page
 * continuation merge (PRD §6.3 post-processing #5): a segment with
 * is_continuation and no label merges into the previous page's last
 * segment; one with a label merges into the earlier segment sharing it.
 * Only the first segment on a page is considered a candidate continuation
 * — an answer resumes at the top of the next page, not mid-page.
 */
export function buildAnswerSegments(pages: PageSegments[]): AnswerSegment[] {
  const sortedPages = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);

  const result: AnswerSegment[] = [];
  const byLabel = new Map<string, AnswerSegment>();
  let lastSegmentOverall: AnswerSegment | null = null;
  let lastSegmentContinuesOnNext = false;

  for (const page of sortedPages) {
    page.raw.forEach((raw, i) => {
      const seg = normaliseOne(raw, page.pageIndex, i);
      const isFirstOnPage = i === 0;

      if (seg.isContinuation && isFirstOnPage) {
        const target = seg.detectedLabel
          ? byLabel.get(seg.detectedLabel)
          : lastSegmentContinuesOnNext
            ? lastSegmentOverall
            : null;
        if (target) {
          target.transcript = `${target.transcript}\n${seg.transcript}`;
          target.regions = [...target.regions, ...seg.regions];
          lastSegmentOverall = target;
          lastSegmentContinuesOnNext = raw.continues_on_next_page;
          return;
        }
      }

      result.push(seg);
      if (seg.detectedLabel) byLabel.set(seg.detectedLabel, seg);
      lastSegmentOverall = seg;
      lastSegmentContinuesOnNext = raw.continues_on_next_page;
    });
  }

  return result;
}
