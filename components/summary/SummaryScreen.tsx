"use client";

import { ArrowLeft, Plus, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import type { Session } from "@/lib/types";

const VERDICT_COLORS: Record<string, string> = {
  correct: "bg-success",
  partially_correct: "bg-amber-500",
  incorrect: "bg-danger",
  unanswered: "bg-line",
  ungradable: "bg-muted-foreground",
};

export function SummaryScreen({
  session,
  onBack,
  onNewUpload,
}: {
  session: Session;
  onBack: () => void;
  onNewUpload: () => void;
}) {
  const { summary, questions, grades } = session;
  if (!summary) return null;

  const gradeByQuestion = new Map(grades.map((g) => [g.questionId, g]));
  const verdictCounts = grades.reduce<Record<string, number>>((acc, g) => {
    acc[g.verdict] = (acc[g.verdict] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell collapsed onBack={onNewUpload}>
      <div className="bg-page-working min-h-full px-6 py-8">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to review
          </button>
          <button
            type="button"
            onClick={onNewUpload}
            className="flex items-center gap-1.5 rounded-pill border border-line px-4 py-1.5 text-xs font-medium hover:bg-secondary/50"
          >
            <Plus className="size-3.5" /> New exam
          </button>
        </div>

        <div className="mx-auto max-w-3xl space-y-4">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total score</p>
                <p className="font-display text-3xl font-bold">
                  {summary.totalAwarded} / {summary.totalMax}{" "}
                  <span className="text-brand-gradient">({summary.percentage}%)</span>
                </p>
              </div>
              <div className="flex gap-4 text-center text-xs">
                <div>
                  <p className="text-lg font-semibold text-success">{summary.answered}</p>
                  <p className="text-muted-foreground">Answered</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-muted-foreground">{summary.unanswered}</p>
                  <p className="text-muted-foreground">Unanswered</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-amber-600">{summary.unmatched}</p>
                  <p className="text-muted-foreground">Unmatched</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-secondary">
              {Object.entries(verdictCounts).map(([verdict, count]) => (
                <div
                  key={verdict}
                  className={VERDICT_COLORS[verdict] ?? "bg-line"}
                  style={{ width: `${(count / Math.max(grades.length, 1)) * 100}%` }}
                  title={`${verdict}: ${count}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-success">Strengths</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {summary.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-danger">Weaknesses</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {summary.weaknesses.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <p className="mb-2 text-sm font-semibold">Overall feedback</p>
            <p className="text-sm text-muted-foreground">{summary.overallFeedback}</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Question</th>
                  <th className="px-4 py-2 font-medium">Verdict</th>
                  <th className="px-4 py-2 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => {
                  const g = gradeByQuestion.get(q.id);
                  return (
                    <tr key={q.id} className="border-t border-line">
                      <td className="max-w-[320px] truncate px-4 py-2">{q.displayNumber}. {q.text}</td>
                      <td className="px-4 py-2 capitalize text-muted-foreground">{g?.verdict.replace("_", " ") ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{g ? `${g.awarded}/${g.max}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            <TriangleAlert className="size-4 shrink-0" />
            <span>AI-generated. Review before sharing with the student.</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
