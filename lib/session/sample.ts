"use client";

import { ingestFile } from "@/lib/raster";
import type { PageAsset } from "@/lib/types";

/**
 * Loads the bundled sample question paper + answer sheet (PRD §9 "Try a
 * sample") and rasterises them exactly like a real upload would.
 */
export async function loadSampleSession(): Promise<{
  questionPages: PageAsset[];
  answerPages: PageAsset[];
}> {
  const [questionBlob, answerBlob] = await Promise.all([
    fetch("/samples/question-paper.pdf").then((r) => r.blob()),
    fetch("/samples/answer-sheet.pdf").then((r) => r.blob()),
  ]);

  const questionFile = new File([questionBlob], "question-paper.pdf", { type: "application/pdf" });
  const answerFile = new File([answerBlob], "answer-sheet.pdf", { type: "application/pdf" });

  const [questionPages, answerPages] = await Promise.all([
    ingestFile(questionFile, 0),
    ingestFile(answerFile, 0),
  ]);

  return { questionPages, answerPages };
}
