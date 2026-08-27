import type { BBox } from "@/lib/types";

/**
 * Pure box math. Isomorphic — no
 * DOM dependency — so it runs identically in API routes and in unit tests.
 * Ink-tightening (step 3) needs a canvas and lives in lib/boxes.client.ts.
 */

/** [ymin, xmin, ymax, xmax], 0-1000 normalised — the model's native coordinate space. */
export type RawBox2d = readonly [number, number, number, number];

/** Convert one 0-1000 normalised box to a 0-1 fraction BBox. */
export function toBBox([ymin, xmin, ymax, xmax]: RawBox2d): BBox {
  return {
    x: xmin / 1000,
    y: ymin / 1000,
    w: (xmax - xmin) / 1000,
    h: (ymax - ymin) / 1000,
  };
}

/** Union of two or more BBoxes' bounding rectangle. */
export function unionBBox(boxes: BBox[]): BBox {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const MAX_REGIONS_PER_SEGMENT = 4;
const VERTICAL_GAP_LINE_HEIGHT_MULTIPLIER = 1.5;

/**
 * Merge per-line boxes (already sorted top-to-bottom) into ≤4 clean regions:
 * group consecutive lines whose vertical gap is < 1.5x the median line
 * height, then take the union of each group.
 */
export function mergeLineBoxes(lines: BBox[]): BBox[] {
  if (lines.length === 0) return [];
  if (lines.length === 1) return [lines[0]];

  const sorted = [...lines].sort((a, b) => a.y - b.y);
  const heights = sorted.map((b) => b.h).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 0.01;

  const groups: BBox[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.y - (prev.y + prev.h);
    if (gap < medianHeight * VERTICAL_GAP_LINE_HEIGHT_MULTIPLIER) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }

  const regions = groups.map(unionBBox);

  // Cap at 4 regions: if there are more, merge the smallest gaps until ≤4.
  while (regions.length > MAX_REGIONS_PER_SEGMENT) {
    let minGapIdx = 0;
    let minGap = Infinity;
    for (let i = 0; i < regions.length - 1; i++) {
      const gap = regions[i + 1].y - (regions[i].y + regions[i].h);
      if (gap < minGap) {
        minGap = gap;
        minGapIdx = i;
      }
    }
    const merged = unionBBox([regions[minGapIdx], regions[minGapIdx + 1]]);
    regions.splice(minGapIdx, 2, merged);
  }

  return regions;
}

const MIN_WIDTH = 0.01;
const MIN_HEIGHT = 0.005;
const MAX_PAGE_COVERAGE = 0.85;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Clamp to [0,1] and drop degenerate or page-spanning boxes. */
export function sanitiseBBoxes(boxes: BBox[]): BBox[] {
  return boxes
    .map((b) => {
      const x = clamp01(b.x);
      const y = clamp01(b.y);
      const w = clamp01(b.x + b.w) - x;
      const h = clamp01(b.y + b.h) - y;
      return { x, y, w, h };
    })
    .filter((b) => b.w >= MIN_WIDTH && b.h >= MIN_HEIGHT)
    .filter((b) => b.w * b.h <= MAX_PAGE_COVERAGE);
}

/** Expand a box for display: 0.5% of height top/bottom, 1% of width left/right. */
export function padBBoxForDisplay(b: BBox): BBox {
  const padX = 0.01;
  const padY = 0.005;
  return {
    x: clamp01(b.x - padX),
    y: clamp01(b.y - padY),
    w: Math.min(1 - clamp01(b.x - padX), b.w + padX * 2),
    h: Math.min(1 - clamp01(b.y - padY), b.h + padY * 2),
  };
}
