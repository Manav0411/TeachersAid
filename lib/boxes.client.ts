"use client";

import type { BBox } from "@/lib/types";

/**
 * Ink-tightening — a big accuracy win: the model's boxes tend to be loose
 * on one side, so we crop to ink using an offscreen canvas. Runs in the
 * browser because it needs the actual page raster the model saw.
 */

const MARGIN = 0.02;
const RE_EXPAND = 0.01;
const SKIP_IF_COVERAGE_ABOVE = 0.6;
const OTSU_BINS = 256;

function otsuThreshold(histogram: number[]): number {
  const total = histogram.reduce((a, b) => a + b, 0);
  let sumAll = 0;
  for (let i = 0; i < OTSU_BINS; i++) sumAll += i * histogram[i];

  let sumB = 0;
  let weightB = 0;
  let maxVariance = 0;
  let threshold = 127;

  for (let t = 0; t < OTSU_BINS; t++) {
    weightB += histogram[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/**
 * Crop to `region` (+2% margin) from `pageDataUrl`, threshold to find ink,
 * and return a tightened BBox re-expanded by 1%. Returns the input region
 * unchanged (flagging via the boolean) if it covers too much of the page to
 * safely tighten — that's very likely a bad model box, not real ink.
 */
export async function tightenToInk(
  pageDataUrl: string,
  region: BBox
): Promise<{ bbox: BBox; tightened: boolean }> {
  if (region.w * region.h > SKIP_IF_COVERAGE_ABOVE) {
    return { bbox: region, tightened: false };
  }

  const img = await loadImage(pageDataUrl);
  const pageW = img.naturalWidth;
  const pageH = img.naturalHeight;

  const cropX = Math.max(0, (region.x - MARGIN) * pageW);
  const cropY = Math.max(0, (region.y - MARGIN) * pageH);
  const cropW = Math.min(pageW - cropX, (region.w + MARGIN * 2) * pageW);
  const cropH = Math.min(pageH - cropY, (region.h + MARGIN * 2) * pageH);
  if (cropW <= 0 || cropH <= 0) return { bbox: region, tightened: false };

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropW);
  canvas.height = Math.round(cropH);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { bbox: region, tightened: false };

  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const gray = new Uint8ClampedArray(canvas.width * canvas.height);
  const histogram = new Array(OTSU_BINS).fill(0);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    gray[p] = g;
    histogram[g]++;
  }
  const threshold = otsuThreshold(histogram);

  // Ink = darker than threshold (handwriting on a light page).
  const rowHasInk = new Array(canvas.height).fill(false);
  const colHasInk = new Array(canvas.width).fill(false);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (gray[y * canvas.width + x] < threshold) {
        rowHasInk[y] = true;
        colHasInk[x] = true;
      }
    }
  }

  const firstRow = rowHasInk.indexOf(true);
  const lastRow = rowHasInk.lastIndexOf(true);
  const firstCol = colHasInk.indexOf(true);
  const lastCol = colHasInk.lastIndexOf(true);

  if (firstRow === -1 || firstCol === -1) {
    // No ink found (blank crop) — keep the original region.
    return { bbox: region, tightened: false };
  }

  const tightX = (cropX + firstCol) / pageW;
  const tightY = (cropY + firstRow) / pageH;
  const tightW = (lastCol - firstCol + 1) / pageW;
  const tightH = (lastRow - firstRow + 1) / pageH;

  const tightened: BBox = {
    x: Math.max(0, tightX - RE_EXPAND),
    y: Math.max(0, tightY - RE_EXPAND),
    w: Math.min(1, tightW + RE_EXPAND * 2),
    h: Math.min(1, tightH + RE_EXPAND * 2),
  };

  return { bbox: tightened, tightened: true };
}
