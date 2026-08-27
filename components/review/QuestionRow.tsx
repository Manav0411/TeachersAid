"use client";

import { ChevronDown } from "lucide-react";
import type { AnswerSegment, Grade, Mapping, Question } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEEDS_REVIEW_THRESHOLD = 0.7;

export function scoreChipClass(grade: Grade | undefined): string {
  if (!grade) return "text-muted-foreground";
  if (grade.verdict === "unanswered" || grade.awarded === 0) return "text-danger";
  if (grade.awarded >= grade.max) return "text-success";
  return "text-amber-600";
}

export function QuestionRow({
  question,
  grade,
  mapping,
  segments,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onHoverChange,
  onReassign,
}: {
  question: Question;
  grade: Grade | undefined;
  mapping: Mapping | undefined;
  segments: AnswerSegment[];
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onHoverChange: (hovering: boolean) => void;
  onReassign: (questionId: string | null) => void;
}) {
  const unanswered = mapping?.status === "unanswered";
  const needsReview = (mapping?.confidence ?? 1) < NEEDS_REVIEW_THRESHOLD && mapping?.status === "answered";
  const transcript = segments
    .filter((s) => !s.isStruckThrough)
    .map((s) => s.transcript)
    .join("\n");

  return (
    <div
      className={cn(
        "rounded-xl border bg-white transition-colors",
        isSelected ? "border-brand-to shadow-sm" : "border-line",
        unanswered && "border-dashed bg-secondary/30"
      )}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {/* Two sibling buttons, not a button nested inside a button (invalid
          HTML — browsers hoist the inner one out, breaking both mouse and
          keyboard behavior in unpredictable ways). Splitting "select" and
          "expand" into their own buttons also makes the expand toggle
          keyboard-reachable at all — previously it was a bare ChevronDown
          icon with only a mouse onClick, so Tab skipped over it entirely. */}
      <div className="flex w-full items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              isSelected ? "bg-brand-to text-white" : "bg-secondary text-foreground"
            )}
          >
            {question.sortKey[0] ?? "?"}
          </span>
          <span className={cn("min-w-0 flex-1 truncate text-sm", unanswered && "text-muted-foreground")}>
            {question.displayNumber}. {question.text}
          </span>
          {needsReview && (
            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              Needs review
            </span>
          )}
          <span className={cn("shrink-0 text-xs font-semibold tabular-nums", scoreChipClass(grade))}>
            {grade ? `${grade.awarded}/${grade.max}` : "—"}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
          className="shrink-0 rounded p-0.5 hover:bg-secondary"
        >
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")}
          />
        </button>
      </div>

      {isExpanded && (
        <div className="mx-3 mb-3 rounded-lg bg-secondary/60 p-3 text-xs">
          {grade ? (
            <>
              <p className="mb-1.5 font-semibold text-foreground">AI Feedback</p>
              <p className="text-muted-foreground">{grade.feedback}</p>
              {grade.missedPoints.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-muted-foreground">
                  {grade.missedPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">No answer to grade for this question yet.</p>
          )}

          {transcript && (
            <div className="mt-3 border-t border-line/60 pt-2">
              <p className="mb-1 font-semibold text-foreground">Student&apos;s answer</p>
              <p className="whitespace-pre-line text-muted-foreground">{transcript}</p>
            </div>
          )}

          {mapping && mapping.status !== "unanswered" && (
            <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2">
              <span className="text-muted-foreground">
                Matched by {mapping.method} · {Math.round(mapping.confidence * 100)}%
              </span>
              <button
                type="button"
                onClick={() => onReassign(null)}
                className="font-medium text-brand-to underline underline-offset-2"
              >
                Unassign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
