import { describe, expect, it } from "vitest";
import { mergeLineBoxes, sanitiseBBoxes, toBBox, unionBBox } from "@/lib/boxes";
import type { BBox } from "@/lib/types";

describe("toBBox", () => {
  it("converts a 0-1000 box to a 0-1 fraction BBox", () => {
    expect(toBBox([100, 200, 300, 400])).toEqual({ x: 0.2, y: 0.1, w: 0.2, h: 0.2 });
  });
});

describe("mergeLineBoxes", () => {
  it("groups close lines into one region", () => {
    const lines: BBox[] = [
      { x: 0.1, y: 0.1, w: 0.5, h: 0.02 },
      { x: 0.1, y: 0.13, w: 0.5, h: 0.02 }, // gap 0.01 < 1.5*0.02
      { x: 0.1, y: 0.16, w: 0.5, h: 0.02 },
    ];
    const regions = mergeLineBoxes(lines);
    expect(regions).toHaveLength(1);
    expect(regions[0].y).toBeCloseTo(0.1);
  });

  it("splits into separate regions across a large vertical gap", () => {
    const lines: BBox[] = [
      { x: 0.1, y: 0.1, w: 0.5, h: 0.02 },
      { x: 0.1, y: 0.5, w: 0.5, h: 0.02 }, // huge gap
    ];
    const regions = mergeLineBoxes(lines);
    expect(regions).toHaveLength(2);
  });

  it("caps output at 4 regions", () => {
    const lines: BBox[] = Array.from({ length: 8 }, (_, i) => ({
      x: 0.1,
      y: i * 0.1,
      w: 0.5,
      h: 0.01,
    }));
    const regions = mergeLineBoxes(lines);
    expect(regions.length).toBeLessThanOrEqual(4);
  });
});

describe("sanitiseBBoxes", () => {
  it("drops degenerate (too thin/short) boxes", () => {
    const result = sanitiseBBoxes([
      { x: 0, y: 0, w: 0.005, h: 0.5 }, // too thin
      { x: 0, y: 0, w: 0.5, h: 0.001 }, // too short
      { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, // fine
    ]);
    expect(result).toHaveLength(1);
  });

  it("drops boxes covering more than 85% of the page", () => {
    const result = sanitiseBBoxes([{ x: 0, y: 0, w: 0.95, h: 0.95 }]);
    expect(result).toHaveLength(0);
  });

  it("clamps out-of-range boxes to [0,1]", () => {
    const [box] = sanitiseBBoxes([{ x: -0.1, y: -0.1, w: 0.3, h: 0.3 }]);
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
  });
});

describe("unionBBox", () => {
  it("computes the bounding rectangle of multiple boxes", () => {
    const result = unionBBox([
      { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
      { x: 0.3, y: 0.3, w: 0.1, h: 0.1 },
    ]);
    expect(result.x).toBeCloseTo(0.1);
    expect(result.y).toBeCloseTo(0.1);
    expect(result.w).toBeCloseTo(0.3);
    expect(result.h).toBeCloseTo(0.3);
  });
});
