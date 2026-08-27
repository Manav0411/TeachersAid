"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { AnswerSheetPanel, type PageRegion } from "@/components/viewer/AnswerSheetPanel";
import { QuestionRow, scoreChipClass } from "./QuestionRow";
import type { Session } from "@/lib/types";
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
}: {
  session: Session;
  onReassign: (segmentId: string, questionId: string | null) => void;
  onOpenSummary: () => void;
}) {
  const { questions, segments, mappings, grades } = session;
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(questions[0]?.id ?? null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [hoveredQuestionId, setHoveredQuestionId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [showUnmatched, setShowUnmatched] = useState(false);
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
            {hasGrades && (
              <button
                type="button"
                onClick={onOpenSummary}
                className="rounded-pill border border-line px-4 py-1.5 text-xs font-medium hover:bg-secondary/50"
              >
                Summary
              </button>
            )}
            <button
              type="button"
              title="Coming soon"
              disabled
              className="flex items-center gap-1.5 rounded-pill bg-ink px-4 py-1.5 text-xs font-medium text-white opacity-40"
            >
              <Download className="size-3.5" /> Export report
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 bg-page-working p-4 lg:grid-cols-[380px_1fr]">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            <div className="border-b border-line p-3">
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
                  onSelect={() => setSelectedQuestionId(q.id)}
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
                    if (mapping?.segmentIds[0]) onReassign(mapping.segmentIds[0], questionId);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3">
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
            {selectedQuestion.displayNumber} score {scoreChipClass(gradeByQuestion.get(selectedQuestion.id))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
