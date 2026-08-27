"use client";

import { useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PageAsset } from "@/lib/types";

export type DropzoneFileInfo = {
  file: File;
  pages: PageAsset[];
};

export function Dropzone({
  label,
  accentWord,
  maxMb,
  value,
  loading,
  error,
  onSelect,
  onRemove,
}: {
  label: string;
  accentWord: string;
  maxMb: number;
  value: DropzoneFileInfo | null;
  loading?: boolean;
  error?: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onSelect(file);
  }

  return (
    <div
      className={cn(
        "relative flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white/60 p-6 text-center transition-colors",
        dragActive && "border-brand-to bg-white",
        error && "border-danger"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {value ? (
        <div className="flex w-full items-center gap-3 rounded-xl border border-line bg-white p-3 text-left shadow-sm">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-danger/10 text-danger">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(value.file.size / (1024 * 1024)).toFixed(1)}MB
              {value.pages.length > 0 &&
                ` • ${value.pages.length} Page${value.pages.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button
            type="button"
            aria-label={`Remove ${value.file.name}`}
            onClick={onRemove}
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-3"
          disabled={loading}
        >
          <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
            <Upload className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {label} <span className="text-brand-gradient font-semibold">{accentWord}</span>
          </p>
          <p className="text-xs text-muted-foreground">Max {maxMb}MB</p>
        </button>
      )}

      {loading && (
        <p className="text-xs text-muted-foreground">Reading pages…</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
