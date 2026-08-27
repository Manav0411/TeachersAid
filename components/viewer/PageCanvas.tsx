"use client";

import { useEffect, useRef } from "react";
import type { BBox, PageAsset } from "@/lib/types";
import { padBBoxForDisplay } from "@/lib/boxes";
import { cn } from "@/lib/utils";

export type HighlightRegion = {
  bbox: BBox;
  label?: string;
  variant?: "active" | "hover" | "unmatched" | "debug-merged" | "debug-final";
};

/**
 * Renders one page image with regions overlaid as percentages of the same
 * box the image fills — zoom and resize come free. Highlighting combines a
 * dimmed-page focus scrim with the Figma's green ring + corner label chip.
 */
export function PageCanvas({
  page,
  regions,
  scrimActive,
  zoom = 100,
  scrollToFirstRegion,
}: {
  page: PageAsset;
  regions: HighlightRegion[];
  scrimActive: boolean;
  zoom?: number;
  scrollToFirstRegion?: boolean;
}) {
  const firstRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollToFirstRegion && firstRegionRef.current) {
      firstRegionRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [scrollToFirstRegion, regions]);

  return (
    <div className="relative mx-auto" style={{ width: `${zoom}%`, maxWidth: "none" }}>
      {scrimActive && <div className="absolute inset-0 z-10 rounded-md bg-black/45" />}
      {/* eslint-disable-next-line @next/next/no-img-element -- data URLs, not next/image candidates */}
      <img src={page.dataUrl} alt={`Page ${page.index + 1}`} className="block w-full h-auto rounded-md" />
      {regions.map((region, i) => {
        const padded = padBBoxForDisplay(region.bbox);
        const isActive =
          region.variant !== "hover" &&
          region.variant !== "unmatched" &&
          region.variant !== "debug-merged" &&
          region.variant !== "debug-final";
        return (
          <div
            key={i}
            ref={i === 0 ? firstRegionRef : undefined}
            className={cn(
              "absolute z-20 rounded-md border-2 pointer-events-none transition-all duration-200",
              region.variant === "unmatched" && "border-amber-500 bg-amber-500/10",
              region.variant === "hover" && "border-success/60 bg-success/5",
              region.variant === "debug-merged" && "z-30 rounded-none border border-dashed border-orange-500 bg-transparent",
              region.variant === "debug-final" && "z-30 rounded-none border border-dashed border-sky-500 bg-transparent",
              isActive && "border-success bg-success/15 shadow-[0_0_0_3px_rgba(52,172,21,0.15)]"
            )}
            style={{
              left: `${padded.x * 100}%`,
              top: `${padded.y * 100}%`,
              width: `${padded.w * 100}%`,
              height: `${padded.h * 100}%`,
            }}
          >
            {region.label && isActive && (
              <span className="absolute -top-3 -left-1 rounded-sm bg-success px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {region.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
