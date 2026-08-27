"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Progress } from "@/components/ui/progress";
import type { SessionStage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = { key: SessionStage; label: string };

const STEPS: Step[] = [
  { key: "questions", label: "Reading question paper" },
  { key: "answers", label: "Reading answer sheet" },
  { key: "mapping", label: "Mapping answers" },
  { key: "grading", label: "Grading" },
];

const STAGE_ORDER: SessionStage[] = ["idle", "questions", "answers", "mapping", "grading", "done"];

function stepState(stepKey: SessionStage, currentStage: SessionStage): "pending" | "active" | "done" {
  const stepIdx = STAGE_ORDER.indexOf(stepKey);
  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  if (currentIdx > stepIdx) return "done";
  if (currentIdx === stepIdx) return "active";
  return "pending";
}

/** Remounts (via `key`) whenever the active stage changes, so its
 * "still working" timer restarts cleanly without setState-in-effect. */
function SlowNotice() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(t);
  }, []);
  return <p className="mt-1 text-center text-sm text-muted-foreground">{slow ? "Still working — large pages take longer" : "This may take a while"}</p>;
}

export function ProcessingScreen({
  stage,
  progress,
  errors,
  onCancel,
}: {
  stage: SessionStage;
  progress: { label: string; done: number; total: number };
  errors: string[];
  onCancel: () => void;
}) {
  return (
    <AppShell collapsed>
      <div className="bg-page-working flex min-h-full flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 shadow-sm">
          <h2 className="text-center font-display text-xl font-bold">Extracting…</h2>
          <SlowNotice key={stage} />

          <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="mt-6" aria-live="polite" />

          <ol className="mt-6 flex flex-col gap-3">
            {STEPS.map((step) => {
              const state = stepState(step.key, stage);
              return (
                <li key={step.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border",
                      state === "done" && "border-success bg-success text-white",
                      state === "active" && "border-brand-to text-brand-to",
                      state === "pending" && "border-line text-muted-foreground"
                    )}
                  >
                    {state === "done" && <Check className="size-3.5" />}
                    {state === "active" && <Loader2 className="size-3.5 animate-spin" />}
                    {state === "pending" && <span className="size-1.5 rounded-full bg-line" />}
                  </span>
                  <span className={cn(state === "pending" && "text-muted-foreground")}>{step.label}</span>
                  {state === "active" && progress.label && (
                    <span className="ml-auto text-xs text-muted-foreground">{progress.label}</span>
                  )}
                </li>
              );
            })}
          </ol>

          {errors.length > 0 && (
            <div className="mt-6 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              <TriangleAlert className="size-4 shrink-0" />
              <span>
                {errors.length} page{errors.length === 1 ? "" : "s"} had a problem and were skipped — the run
                continues.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="mt-6 w-full rounded-pill border border-line py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/50"
          >
            Cancel
          </button>
        </div>
      </div>
    </AppShell>
  );
}
