"use client";

import type { PageAsset } from "@/lib/types";

/**
 * Client-side ingest & rasterisation. Runs entirely in the browser — the
 * server never sees the original file, only the JPEG data URLs produced
 * here, one page at a time.
 */

export const MAX_PAGES = 20;
export const MAX_FILE_MB = 10; // matches the Figma dropzone copy ("Max 10MB")
export const TARGET_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.82;

export class UploadValidationError extends Error {}

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic"];

export function validateFile(file: File): void {
  const name = file.name.toLowerCase();
  const ok = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!ok) {
    throw new UploadValidationError(
      `Unsupported file type. Accepted: PDF, PNG, JPG, WEBP, HEIC.`
    );
  }
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_FILE_MB) {
    throw new UploadValidationError(
      `File is ${sizeMb.toFixed(1)}MB — max is ${MAX_FILE_MB}MB.`
    );
  }
}

/** Downscale + re-encode a canvas to a JPEG data URL under the size budget. */
function canvasToJpegDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

async function heicToJpegFile(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], file.name.replace(/\.heic$/i, ".jpg"), {
    type: "image/jpeg",
  });
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

/** Rasterise a single image file (PNG/JPG/WEBP/HEIC) into one PageAsset. */
async function rasteriseImageFile(
  file: File,
  index: number
): Promise<PageAsset> {
  const isHeic = file.name.toLowerCase().endsWith(".heic");
  const source = isHeic ? await heicToJpegFile(file) : file;

  const bitmap = await loadImageBitmap(source);
  const scale = Math.min(1, TARGET_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return { index, width, height, dataUrl: canvasToJpegDataUrl(canvas) };
}

/** Rasterise every page of a PDF into PageAssets, starting at `startIndex`. */
async function rasterisePdfFile(
  file: File,
  startIndex: number
): Promise<PageAsset[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  if (pdf.numPages > MAX_PAGES) {
    throw new UploadValidationError(
      `PDF has ${pdf.numPages} pages — max is ${MAX_PAGES}.`
    );
  }

  const pages: PageAsset[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, TARGET_LONG_EDGE / unscaledViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    pages.push({
      index: startIndex + pages.length,
      width: canvas.width,
      height: canvas.height,
      dataUrl: canvasToJpegDataUrl(canvas),
    });
  }
  return pages;
}

/**
 * Ingest one uploaded file (PDF or image) into one or more PageAssets, with
 * `startIndex` as the first page's document-order index.
 */
export async function ingestFile(
  file: File,
  startIndex = 0
): Promise<PageAsset[]> {
  validateFile(file);
  if (file.name.toLowerCase().endsWith(".pdf")) {
    return rasterisePdfFile(file, startIndex);
  }
  return [await rasteriseImageFile(file, startIndex)];
}

/** Rough estimate of a data URL's byte size, for the "target ≤500KB/page" budget. */
export function dataUrlSizeKb(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.round((base64.length * 0.75) / 1024);
}
