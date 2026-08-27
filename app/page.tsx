"use client";

import { useState } from "react";
import { SessionProvider, useSession } from "@/lib/session/context";
import { useOrchestrator } from "@/lib/session/useOrchestrator";
import { UploadScreen } from "@/components/upload/UploadScreen";
import type { DropzoneFileInfo } from "@/components/upload/Dropzone";
import { ProcessingScreen } from "@/components/processing/ProcessingScreen";
import { ReviewScreen } from "@/components/review/ReviewScreen";
import { SummaryScreen } from "@/components/summary/SummaryScreen";
import { loadSampleSession } from "@/lib/session/sample";
import { AppShell } from "@/components/shell/AppShell";

function Flow() {
  const { session, dispatch } = useSession();
  const { run, cancel } = useOrchestrator();
  const [view, setView] = useState<"review" | "summary">("review");
  const [loadingSample, setLoadingSample] = useState(false);

  async function handleStart(question: DropzoneFileInfo, answer: DropzoneFileInfo) {
    await run(question.pages, answer.pages);
  }

  async function handleTrySample() {
    setLoadingSample(true);
    try {
      const sample = await loadSampleSession();
      await run(sample.questionPages, sample.answerPages);
    } finally {
      setLoadingSample(false);
    }
  }

  function handleReassign(segmentId: string, questionId: string | null) {
    dispatch({ type: "REASSIGN_SEGMENT", segmentId, questionId });
  }

  if (session.stage === "idle") {
    return (
      <UploadScreen
        onStart={handleStart}
        onTrySample={handleTrySample}
        loadingSample={loadingSample}
      />
    );
  }

  if (session.stage === "error" && session.questions.length === 0) {
    return (
      <AppShell>
        <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <h2 className="font-display text-xl font-bold">Couldn&apos;t read either document</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {session.errors[session.errors.length - 1] ?? "Something went wrong reading the uploaded files."}
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: "RESET" })}
            className="rounded-pill bg-ink px-6 py-2 text-sm font-medium text-white"
          >
            Start over
          </button>
        </div>
      </AppShell>
    );
  }

  if (session.stage !== "done" && session.stage !== "error") {
    return (
      <ProcessingScreen
        stage={session.stage}
        progress={session.progress}
        errors={session.errors}
        onCancel={() => {
          cancel();
          dispatch({ type: "RESET" });
        }}
      />
    );
  }

  return view === "summary" ? (
    <SummaryScreen session={session} onBack={() => setView("review")} />
  ) : (
    <ReviewScreen session={session} onReassign={handleReassign} onOpenSummary={() => setView("summary")} />
  );
}

export default function Home() {
  return (
    <SessionProvider>
      <Flow />
    </SessionProvider>
  );
}
