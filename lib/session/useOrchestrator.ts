"use client";

import { useCallback, useRef } from "react";
import type { AnswerSegment, Grade, PageAsset, Question } from "@/lib/types";
import type {
  ExtractAnswersModelResponse,
  ExtractQuestionsModelResponse,
  GradeModelResponse,
  RawGrade,
  SummaryModelResponse,
} from "@/lib/schemas";
import { pagePool, withRetry } from "@/lib/pool";
import { postJson } from "./api";
import { useSession } from "./context";
import { reconcileQuestions } from "@/lib/questions/reconcile";
import { buildAnswerSegments } from "@/lib/answers/normalise";
import { tightenToInk } from "@/lib/boxes.client";
import { runMappingEngine, validateMappings } from "@/lib/mapping";
import {
  buildGradeItems,
  buildLocalSummaryCounts,
  fromRawGrade,
  localUnansweredGrades,
  computeSummary,
} from "@/lib/grading/normalise";

// PRD §9 processing screen weights.
const WEIGHTS = { questions: 25, answers: 40, mapping: 15, grading: 20 };
const GRADE_BATCH_SIZE = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function useOrchestrator() {
  const { session, dispatch } = useSession();
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(
    async (questionPages: PageAsset[], answerPages: PageAsset[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const aborted = () => controller.signal.aborted;

      dispatch({ type: "SET_QUESTION_PAGES", pages: questionPages });
      dispatch({ type: "SET_ANSWER_PAGES", pages: answerPages });
      dispatch({ type: "SET_STAGE", stage: "questions" });

      let qDone = 0;
      let aDone = 0;
      const qTotal = questionPages.length;
      const aTotal = answerPages.length;

      function reportProgress(label: string, mappingDone = 0, gDone = 0, gTotal = 0) {
        const pct =
          (qTotal ? (qDone / qTotal) * WEIGHTS.questions : 0) +
          (aTotal ? (aDone / aTotal) * WEIGHTS.answers : 0) +
          mappingDone * WEIGHTS.mapping +
          (gTotal ? (gDone / gTotal) * WEIGHTS.grading : 0);
        dispatch({ type: "SET_PROGRESS", label, done: Math.round(pct), total: 100 });
      }
      reportProgress("Reading question paper");

      // --- Stages 1 & 2 in parallel, one page per request, pooled -----------
      const questionPageResults = questionPages.map((page) =>
        pagePool.run(async () => {
          if (aborted()) return null;
          try {
            const data = await withRetry(() =>
              postJson<ExtractQuestionsModelResponse>("/api/extract-questions", { page })
            );
            qDone++;
            reportProgress(`Reading question paper (${qDone}/${qTotal})`);
            return { pageIndex: page.index, section: data.section ?? null, questions: data.questions };
          } catch (err) {
            qDone++;
            dispatch({
              type: "ADD_ERROR",
              message: `Question page ${page.index + 1}: ${err instanceof Error ? err.message : "failed"}`,
            });
            reportProgress(`Reading question paper (${qDone}/${qTotal})`);
            return null;
          }
        })
      );

      const answerPageResults = answerPages.map((page) =>
        pagePool.run(async () => {
          if (aborted()) return null;
          try {
            const data = await withRetry(() =>
              postJson<ExtractAnswersModelResponse>("/api/extract-answers", { page })
            );
            aDone++;
            reportProgress(`Reading answer sheet (${aDone}/${aTotal})`);
            return { pageIndex: page.index, raw: data.segments };
          } catch (err) {
            aDone++;
            dispatch({
              type: "ADD_ERROR",
              message: `Answer page ${page.index + 1}: ${err instanceof Error ? err.message : "failed"}`,
            });
            reportProgress(`Reading answer sheet (${aDone}/${aTotal})`);
            return null;
          }
        })
      );

      const [questionPagesRaw, answerPagesRaw] = await Promise.all([
        Promise.all(questionPageResults),
        Promise.all(answerPageResults),
      ]);
      if (aborted()) return;

      const questions: Question[] = reconcileQuestions(
        questionPagesRaw.filter((p): p is NonNullable<typeof p> => p !== null)
      );
      dispatch({ type: "SET_QUESTIONS", questions });

      dispatch({ type: "SET_STAGE", stage: "answers" });
      let segments: AnswerSegment[] = buildAnswerSegments(
        answerPagesRaw.filter((p): p is NonNullable<typeof p> => p !== null)
      );

      // Ink-tighten every region against the actual page raster (browser-only).
      const pageByIndex = new Map(answerPages.map((p) => [p.index, p]));
      await Promise.all(
        segments.map(async (seg) => {
          const tightened = await Promise.all(
            seg.regions.map(async (region) => {
              const page = pageByIndex.get(region.pageIndex);
              if (!page) return region;
              const { bbox } = await tightenToInk(page.dataUrl, region.bbox);
              return { ...region, bbox };
            })
          );
          seg.regions = tightened;
        })
      );
      dispatch({ type: "SET_SEGMENTS", segments });
      if (aborted()) return;

      // --- Stage 3: mapping ---------------------------------------------------
      dispatch({ type: "SET_STAGE", stage: "mapping" });
      reportProgress("Mapping answers to questions", 0);
      const { mappings, derivedSegments } = await runMappingEngine(questions, segments);
      if (derivedSegments.length > 0) {
        segments = [...segments, ...derivedSegments];
        dispatch({ type: "SET_SEGMENTS", segments });
      }
      validateMappings(questions, segments, mappings);
      dispatch({ type: "SET_MAPPINGS", mappings });
      reportProgress("Mapping answers to questions", 1);
      if (aborted()) return;

      // --- Stage 4: grading + summary ------------------------------------------
      dispatch({ type: "SET_STAGE", stage: "grading" });
      const items = buildGradeItems(questions, mappings, segments);
      const batches = chunk(items, GRADE_BATCH_SIZE);
      const rawGrades: RawGrade[] = [];
      let gDone = 0;
      for (const batch of batches) {
        if (aborted()) return;
        try {
          const data = await withRetry(() => postJson<GradeModelResponse>("/api/grade", { items: batch }));
          rawGrades.push(...data.grades);
        } catch (err) {
          dispatch({
            type: "ADD_ERROR",
            message: `Grading batch failed: ${err instanceof Error ? err.message : "unknown error"}`,
          });
        }
        gDone += batch.length;
        reportProgress("Grading", 1, gDone, items.length);
      }

      const questionsById = new Map(questions.map((q) => [q.id, q]));
      const modelGrades: Grade[] = rawGrades.map((g) =>
        fromRawGrade(g, questionsById.get(g.question_id)?.marks ?? 1)
      );
      const grades = [...modelGrades, ...localUnansweredGrades(questions, mappings)];
      dispatch({ type: "SET_GRADES", grades });

      let summaryParts = { strengths: [] as string[], weaknesses: [] as string[], overallFeedback: "" };
      try {
        const summaryRaw = grades.map((g) => ({
          display_number: questionsById.get(g.questionId)?.displayNumber ?? g.questionId,
          awarded: g.awarded,
          verdict: g.verdict,
          feedback: g.feedback,
          missed_points: g.missedPoints,
          confidence: g.gradingConfidence,
        }));
        const data = await withRetry(() =>
          postJson<SummaryModelResponse>("/api/summary", {
            grades: summaryRaw,
            counts: buildLocalSummaryCounts(mappings),
          })
        );
        summaryParts = {
          strengths: data.strengths,
          weaknesses: data.weaknesses,
          overallFeedback: data.overall_feedback,
        };
      } catch (err) {
        dispatch({
          type: "ADD_ERROR",
          message: `Summary generation failed: ${err instanceof Error ? err.message : "unknown error"}`,
        });
      }

      const summary = computeSummary(questions, mappings, grades, summaryParts);
      dispatch({ type: "SET_SUMMARY", summary });

      // PRD §11: reach Review whenever ≥1 question and ≥1 answer page were read.
      if (questions.length === 0 || answerPages.length === 0) {
        dispatch({ type: "SET_STAGE", stage: "error" });
      } else {
        dispatch({ type: "SET_STAGE", stage: "done" });
      }
    },
    [dispatch]
  );

  return { run, cancel, session };
}
