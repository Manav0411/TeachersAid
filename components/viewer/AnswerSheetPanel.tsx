"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { PageAsset } from "@/lib/types";
import { PageCanvas, type HighlightRegion } from "./PageCanvas";
import { cn } from "@/lib/utils";

export type PageRegion = HighlightRegion & { pageIndex: number };

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 10;

export function AnswerSheetPanel({
  pages,
  activeRegions,
  hoverRegions = [],
  unmatchedRegions = [],
  showUnmatched = false,
  debugMergedRegions = [],
  debugFinalRegions = [],
}: {
  pages: PageAsset[];
  activeRegions: PageRegion[];
  hoverRegions?: PageRegion[];
  unmatchedRegions?: PageRegion[];
  showUnmatched?: boolean;
  /** ?debug=boxes overlay: pre-tightening (merged) regions, every segment. */
  debugMergedRegions?: PageRegion[];
  /** ?debug=boxes overlay: final (post-tightening) regions, every segment. */
  debugFinalRegions?: PageRegion[];
}) {
  const [pageIndex, setPageIndex] = useState(pages[0]?.index ?? 0);
  const [zoom, setZoom] = useState(100);

  const pagesWithActiveRegions = new Set(activeRegions.map((r) => r.pageIndex));

  // Auto-jump to the first active region's page when the selection changes.
  // Adjusting state during render (guarded by a key comparison) rather than
  // in an effect, per https://react.dev/learn/you-might-not-need-an-effect.
  const activeKey = activeRegions.map((r) => r.pageIndex).join(",");
  const [lastActiveKey, setLastActiveKey] = useState(activeKey);
  if (activeKey !== lastActiveKey) {
    setLastActiveKey(activeKey);
    if (activeRegions.length > 0 && !pagesWithActiveRegions.has(pageIndex)) {
      setPageIndex(activeRegions[0].pageIndex);
    }
  }

  const currentPage = pages.find((p) => p.index === pageIndex) ?? pages[0];
  if (!currentPage) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No answer sheet pages
      </div>
    );
  }

  const pageOrder = [...pages].map((p) => p.index).sort((a, b) => a - b);
  const posInOrder = pageOrder.indexOf(pageIndex);

  const regionsOnPage: HighlightRegion[] = [
    ...activeRegions.filter((r) => r.pageIndex === pageIndex).map((r) => ({ ...r, variant: "active" as const })),
    ...hoverRegions.filter((r) => r.pageIndex === pageIndex).map((r) => ({ ...r, variant: "hover" as const })),
    ...(showUnmatched
      ? unmatchedRegions.filter((r) => r.pageIndex === pageIndex).map((r) => ({ ...r, variant: "unmatched" as const }))
      : []),
    ...debugMergedRegions
      .filter((r) => r.pageIndex === pageIndex)
      .map((r) => ({ ...r, variant: "debug-merged" as const })),
    ...debugFinalRegions
      .filter((r) => r.pageIndex === pageIndex)
      .map((r) => ({ ...r, variant: "debug-final" as const })),
  ];

  const otherPagesWithActive = [...pagesWithActiveRegions].filter((p) => p !== pageIndex).sort((a, b) => a - b);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between bg-ink px-4 py-3 text-white">
        <span className="text-sm font-semibold">Answer Sheet</span>
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-10 text-center tabular-nums">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
            className="rounded p-1 hover:bg-white/10"
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            disabled={posInOrder <= 0}
            onClick={() => setPageIndex(pageOrder[posInOrder - 1])}
            className="rounded p-1 hover:bg-white/10 disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="tabular-nums">
            Page {posInOrder + 1} of {pageOrder.length}
          </span>
          <button
            type="button"
            disabled={posInOrder >= pageOrder.length - 1}
            onClick={() => setPageIndex(pageOrder[posInOrder + 1])}
            className="rounded p-1 hover:bg-white/10 disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      {(debugMergedRegions.length > 0 || debugFinalRegions.length > 0) && (
        <div className="flex items-center gap-4 border-b border-line bg-secondary/40 px-4 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 border border-dashed border-orange-500" /> merged (pre-tighten)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 border border-dashed border-sky-500" /> tightened (final)
          </span>
        </div>
      )}

      {otherPagesWithActive.length > 0 && (
        <button
          type="button"
          onClick={() => setPageIndex(otherPagesWithActive[0])}
          className="border-b border-line bg-success/10 px-4 py-1.5 text-left text-xs font-medium text-success"
        >
          Answer continues on page {pageOrder.indexOf(otherPagesWithActive[0]) + 1} →
        </button>
      )}

      <div className="flex-1 overflow-auto bg-secondary/30 p-6">
        <PageCanvas page={currentPage} regions={regionsOnPage} scrimActive={activeRegions.length > 0} zoom={zoom} scrollToFirstRegion />
      </div>

      <div className="flex justify-center gap-1.5 border-t border-line py-2">
        {pageOrder.map((idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setPageIndex(idx)}
            aria-label={`Go to page ${pageOrder.indexOf(idx) + 1}`}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              idx === pageIndex ? "bg-ink" : pagesWithActiveRegions.has(idx) ? "bg-success" : "bg-line"
            )}
          />
        ))}
      </div>
    </div>
  );
}
