"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Search, TriangleAlert, X } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { AnswerSheetPanel, type PageRegion } from "@/components/viewer/AnswerSheetPanel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { QuestionRow } from "./QuestionRow";
import type { Session } from "@/lib/types";
import { buildGradesCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";

type Filter = "all" | "answered" | "unanswered" | "unmatched" | "needs-review";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "answered", label: "Answered" },
  { key: "unanswered", label: "Unanswered" },
  { key: "unmatched", label: "Unmatched" },
  { key: "needs-review", label: "Needs review" },
];

export function ReviewScreen({
  session,
  onReassign,
  onOpenSummary,
  onNewUpload,
}: {
  session: Session;
  onReassign: (segmentId: string, questionId: string | null) => void;
  onOpenSummary: () => void;
  onNewUpload: () => void;
}) {
  const { questions, segments, mappings, grades, errors } = session;
  const [errorsDismissed, setErrorsDismissed] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(questions[0]?.id ?? null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hoveredQuestionId, setHoveredQuestionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showUnmatched, setShowUnmatched] = useState(false);
  // Below `lg` the question list and answer sheet can't both fit — the
  // Figma phone frame uses a "Questions" / "Answer Sheet" tab switcher
  // instead of stacking both panels. Ignored at `lg:` and up, where both
  // panels show side by side regardless of this value.
  const [mobileTab, setMobileTab] = useState<"questions" | "answer-sheet">("questions");
  // ?debug=boxes: overlay pre-tighten (merged) vs. final regions for every
  // segment, to visually audit box-merge/ink-tightening quality. Read via
  // window.location directly (not next/navigation) so it never affects
  // this client-only screen's rendering.
  const [debugBoxes, setDebugBoxes] = useState(false);
  useEffect(() => {
    // Genuinely reading an external system (the URL) once on mount — starting
    // from `false` on both server and client avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDebugBoxes(new URLSearchParams(window.location.search).get("debug") === "boxes");
  }, []);

  const mappingByQuestion = useMemo(() => new Map(mappings.map((m) => [m.questionId, m])), [mappings]);
  const gradeByQuestion = useMemo(() => new Map(grades.map((g) => [g.questionId, g])), [grades]);
  const segmentsById = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);

  const unmatchedSegments = useMemo(
    () => mappings.filter((m) => m.status === "unmatched").flatMap((m) => m.segmentIds).map((id) => segmentsById.get(id)!).filter(Boolean),
    [mappings, segmentsById]
  );

  const counts = {
    answered: mappings.filter((m) => m.status === "answered").length,
    unanswered: mappings.filter((m) => m.status === "unanswered").length,
    unmatched: mappings.filter((m) => m.status === "unmatched").length,
  };
  const hasGrades = grades.length > 0;

  function handleExport() {
    const csv = buildGradesCsv(session);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assessment-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const totalAwarded = grades.reduce((s, g) => s + g.awarded, 0);
  const totalMax = grades.reduce((s, g) => s + g.max, 0);

  const visibleQuestions = questions.filter((q) => {
    if (search && !q.text.toLowerCase().includes(search.toLowerCase()) && !q.displayNumber.includes(search)) {
      return false;
    }
    const mapping = mappingByQuestion.get(q.id);
    if (filter === "answered") return mapping?.status === "answered";
    if (filter === "unanswered") return mapping?.status === "unanswered";
    if (filter === "needs-review") return (mapping?.confidence ?? 1) < 0.7 && mapping?.status === "answered";
    return true;
  });

  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) ?? null;
  const selectedMapping = selectedQuestion ? mappingByQuestion.get(selectedQuestion.id) : undefined;

  function regionsForMapping(questionId: string | null | undefined, variant: "active" | "hover"): PageRegion[] {
    const mapping = mappingByQuestion.get(questionId ?? "");
    if (!mapping) return [];
    return mapping.segmentIds
      .map((id) => segmentsById.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .flatMap((s) =>
        s.regions.map((r) => ({ pageIndex: r.pageIndex, bbox: r.bbox, label: selectedQuestion?.displayNumber, variant }))
      );
  }

  const activeRegions = regionsForMapping(selectedQuestion?.id, "active");
  const hoverRegions = hoveredQuestionId && hoveredQuestionId !== selectedQuestionId ? regionsForMapping(hoveredQuestionId, "hover") : [];
  const unmatchedRegions: PageRegion[] = unmatchedSegments.flatMap((s) =>
    s.regions.map((r) => ({ pageIndex: r.pageIndex, bbox: r.bbox, variant: "unmatched" as const }))
  );

  const debugMergedRegions: PageRegion[] = debugBoxes
    ? segments.flatMap((s) =>
        (s.debugMergedRegions ?? []).map((r) => ({
          pageIndex: r.pageIndex,
          bbox: r.bbox,
          variant: "debug-merged" as const,
        }))
      )
    : [];
  const debugFinalRegions: PageRegion[] = debugBoxes
    ? segments.flatMap((s) =>
        s.regions.map((r) => ({ pageIndex: r.pageIndex, bbox: r.bbox, variant: "debug-final" as const }))
      )
    : [];

  return (
    <AppShell collapsed>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line bg-white px-6 py-3">
          <div className="flex items-center gap-4">
            {hasGrades && (
              <span className="text-sm font-semibold">
                {totalAwarded} / {totalMax} · {totalMax > 0 ? Math.round((totalAwarded / totalMax) * 100) : 0}%
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {counts.answered} answered · {counts.unanswered} unanswered · {counts.unmatched} unmatched
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNewUpload}
              className="flex items-center gap-1.5 rounded-pill border border-line px-4 py-1.5 text-xs font-medium hover:bg-secondary/50"
            >
              <Plus className="size-3.5" /> New exam
            </button>
            {hasGrades && (
              <button
                type="button"
                onClick={onOpenSummary}
                className="rounded-pill border border-line px-4 py-1.5 text-xs font-medium hover:bg-secondary/50"
              >
                Summary
              </button>
            )}
            {hasGrades ? (
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-white hover:bg-ink/90"
              >
                <Download className="size-3.5" /> Export report
              </button>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  // A native `disabled` button doesn't reliably fire hover
                  // events in Chrome/Safari, which would've silently broken
                  // this tooltip the same way it silently broke the native
                  // `title` this replaces. aria-disabled keeps it inert
                  // (there's no onClick here regardless) while staying
                  // hoverable/focusable.
                  aria-disabled="true"
                  className="flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-white opacity-40 cursor-not-allowed"
                >
                  <Download className="size-3.5" /> Export report
                </TooltipTrigger>
                <TooltipContent>Grade the exam first</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex gap-1 border-b border-line bg-white p-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("questions")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
              mobileTab === "questions" ? "bg-ink text-white" : "text-muted-foreground hover:bg-secondary/60"
            )}
          >
            Questions
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("answer-sheet")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition-colors",
              mobileTab === "answer-sheet" ? "bg-ink text-white" : "text-muted-foreground hover:bg-secondary/60"
            )}
          >
            Answer Sheet
          </button>
        </div>

        {/* Extraction ran to completion, but not every page necessarily
            read cleanly — ProcessingScreen shows this same list while the
            run is in progress, but once we're on Review it was otherwise
            never surfaced again, leaving missing questions/answers
            unexplained. Dismissible since it's informational, not blocking. */}
        {errors.length > 0 && !errorsDismissed && (
          <div className="flex items-start gap-2 border-b border-line bg-amber-50 px-6 py-2.5 text-xs text-amber-700">
            <TriangleAlert className="size-4 shrink-0" />
            <span className="flex-1">
              {errors.length} page{errors.length === 1 ? "" : "s"} had a problem during extraction — some
              questions or answers may be missing.
            </span>
            <button
              type="button"
              onClick={() => setErrorsDismissed(true)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 hover:bg-amber-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 bg-page-working p-4 lg:grid-cols-[380px_1fr]">
          <div
            className={cn(
              "min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm lg:flex",
              mobileTab === "questions" ? "flex" : "hidden"
            )}
          >
            <div className="border-b border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Extracted Questions <span className="font-normal text-muted-foreground">(from question paper)</span>
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    const allExpanded = visibleQuestions.length > 0 && visibleQuestions.every((q) => expandedIds.has(q.id));
                    setExpandedIds(allExpanded ? new Set() : new Set(visibleQuestions.map((q) => q.id)));
                  }}
                  className="shrink-0 text-xs font-medium text-brand-to hover:underline"
                >
                  {visibleQuestions.length > 0 && visibleQuestions.every((q) => expandedIds.has(q.id)) ? "Collapse all" : "Expand all"}
                </button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions…"
                  className="w-full rounded-md border border-line py-1.5 pr-2 pl-8 text-sm outline-none focus:border-brand-to"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "rounded-pill border px-2.5 py-1 text-[11px] font-medium",
                      filter === f.key ? "border-brand-to bg-brand-from/10 text-brand-to" : "border-line text-muted-foreground"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {visibleQuestions.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">No questions match this filter.</p>
              )}
              {visibleQuestions.map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  grade={gradeByQuestion.get(q.id)}
                  mapping={mappingByQuestion.get(q.id)}
                  segments={(mappingByQuestion.get(q.id)?.segmentIds ?? []).map((id) => segmentsById.get(id)!).filter(Boolean)}
                  isSelected={q.id === selectedQuestionId}
                  isExpanded={expandedIds.has(q.id)}
                  onSelect={() => {
                    setSelectedQuestionId(q.id);
                    // On mobile, jump straight to the highlighted ink —
                    // matches the Figma phone frame's flow (tap a
                    // question, see its answer). No-op at `lg:` and up,
                    // where both panels are already visible.
                    setMobileTab("answer-sheet");
                  }}
                  onToggleExpand={() =>
                    setExpandedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(q.id)) {
                        next.delete(q.id);
                      } else {
                        next.add(q.id);
                      }
                      return next;
                    })
                  }
                  onHoverChange={(hovering) => setHoveredQuestionId(hovering ? q.id : null)}
                  onReassign={(questionId) => {
                    const mapping = mappingByQuestion.get(q.id);
                    // A mapping can hold more than one segment (merged
                    // duplicates, or prior manual reassignments) — detach
                    // all of them, not just the first.
                    mapping?.segmentIds.forEach((segmentId) => onReassign(segmentId, questionId));
                  }}
                />
              ))}
            </div>
          </div>

          <div
            className={cn(
              "min-h-0 flex-col gap-3 lg:flex",
              mobileTab === "answer-sheet" ? "flex" : "hidden"
            )}
          >
            <AnswerSheetPanel
              pages={session.answerPages}
              activeRegions={activeRegions}
              hoverRegions={hoverRegions}
              unmatchedRegions={unmatchedRegions}
              showUnmatched={showUnmatched}
              debugMergedRegions={debugMergedRegions}
              debugFinalRegions={debugFinalRegions}
            />
            {unmatchedSegments.length > 0 && (
              <div className="rounded-2xl border border-line bg-white p-3 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowUnmatched((v) => !v)}
                  className="mb-2 text-xs font-semibold text-foreground"
                >
                  Unmatched answers ({unmatchedSegments.length}) {showUnmatched ? "· hide on page" : "· show on page"}
                </button>
                <div className="flex flex-wrap gap-2">
                  {unmatchedSegments.map((seg) => (
                    <div
                      key={seg.id}
                      className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-800"
                    >
                      <span className="max-w-[160px] truncate">{seg.transcript || "(blank)"}</span>
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && onReassign(seg.id, e.target.value)}
                        className="bg-transparent text-[11px] font-medium underline"
                      >
                        <option value="" disabled>
                          Assign to…
                        </option>
                        {questions.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.displayNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedQuestion && selectedMapping && (
          <div className="sr-only" aria-live="polite">
            Question {selectedQuestion.displayNumber} selected
            {(() => {
              const grade = gradeByQuestion.get(selectedQuestion.id);
              return grade ? `, score ${grade.awarded} of ${grade.max}` : "";
            })()}
          </div>
        )}
      </div>
    </AppShell>
  );
}
