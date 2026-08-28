"use client";

import { useState } from "react";
import Image from "next/image";
import { AppShell } from "@/components/shell/AppShell";
import { Dropzone, type DropzoneFileInfo } from "./Dropzone";
import { ThumbnailStrip } from "./ThumbnailStrip";
import {
  ingestFile,
  MAX_FILE_MB,
  UploadValidationError,
} from "@/lib/raster";
import { cn } from "@/lib/utils";

type SlotState = {
  info: DropzoneFileInfo | null;
  loading: boolean;
  error: string | null;
};

const EMPTY_SLOT: SlotState = { info: null, loading: false, error: null };

export function UploadScreen({
  onStart,
  onTrySample,
  loadingSample = false,
}: {
  onStart: (questionPages: DropzoneFileInfo, answerPages: DropzoneFileInfo) => void;
  onTrySample: () => void;
  loadingSample?: boolean;
}) {
  const [questionSlot, setQuestionSlot] = useState<SlotState>(EMPTY_SLOT);
  const [answerSlot, setAnswerSlot] = useState<SlotState>(EMPTY_SLOT);

  async function handleSelect(
    file: File,
    setSlot: React.Dispatch<React.SetStateAction<SlotState>>
  ) {
    setSlot({ info: null, loading: true, error: null });
    try {
      const pages = await ingestFile(file, 0);
      setSlot({ info: { file, pages }, loading: false, error: null });
    } catch (err) {
      setSlot({
        info: null,
        loading: false,
        error:
          err instanceof UploadValidationError
            ? err.message
            : "Couldn't read that file — it may be corrupt.",
      });
    }
  }

  const canStart = Boolean(questionSlot.info && answerSlot.info);

  return (
    <AppShell>
      <div className="bg-page-upload flex min-h-full flex-col items-center px-6 py-16">
        <h1 className="font-display text-4xl font-bold">
          Upload{" "}
          <span className="rounded-md bg-brand-from/10 px-2 text-brand-gradient">
            Question Paper &amp; Answer Sheets
          </span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Upload both files to get started
        </p>

        {/* Mascot illustration from the Figma file — cropped from the
            canvas since the MCP connection only has viewer access (no
            asset export). Sits in the app's own brand-tinted circle
            rather than Figma's original peach rings, matching the
            retheme's blue/green palette. */}
        <div className="my-8 flex size-24 items-center justify-center overflow-hidden rounded-full bg-brand-from/15">
          <Image
            src="/mascot.png"
            alt=""
            width={96}
            height={96}
            className="size-full object-cover"
            priority
          />
        </div>

        <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Dropzone
              label="Upload"
              accentWord="Question Paper"
              maxMb={MAX_FILE_MB}
              value={questionSlot.info}
              loading={questionSlot.loading}
              error={questionSlot.error}
              onSelect={(file) => handleSelect(file, setQuestionSlot)}
              onRemove={() => setQuestionSlot(EMPTY_SLOT)}
            />
            <ThumbnailStrip pages={questionSlot.info?.pages ?? []} />
          </div>
          <div>
            <Dropzone
              label="Upload"
              accentWord="Answer Sheet"
              maxMb={MAX_FILE_MB}
              value={answerSlot.info}
              loading={answerSlot.loading}
              error={answerSlot.error}
              onSelect={(file) => handleSelect(file, setAnswerSlot)}
              onRemove={() => setAnswerSlot(EMPTY_SLOT)}
            />
            <ThumbnailStrip pages={answerSlot.info?.pages ?? []} />
          </div>
        </div>

        <button
          type="button"
          disabled={!canStart}
          onClick={() =>
            canStart &&
            questionSlot.info &&
            answerSlot.info &&
            onStart(questionSlot.info, answerSlot.info)
          }
          className={cn(
            "mt-10 rounded-pill border-2 px-11 py-2 text-sm font-medium text-white transition-colors",
            canStart
              ? "border-transparent bg-ink"
              : "cursor-not-allowed border-transparent bg-muted-foreground/40"
          )}
        >
          Start Mapping →
        </button>
        {!canStart && (
          <p className="mt-3 text-xs text-muted-foreground">
            Once both files are uploaded, you&apos;ll be able to map answers with
            questions
          </p>
        )}

        <button
          type="button"
          onClick={onTrySample}
          disabled={loadingSample}
          className="mt-6 text-sm font-medium text-brand-to underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingSample ? "Loading sample…" : "Try a sample instead"}
        </button>
      </div>
    </AppShell>
  );
}
