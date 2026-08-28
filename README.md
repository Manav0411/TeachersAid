# AI Assessment Extraction & Answer Mapping

A single-page app where a teacher uploads a **question paper** and one student's
**handwritten answer sheet**. The app extracts every question in printed order,
transcribes the student's answers, maps answers to questions, lets the teacher
click any question to see the exact ink highlighted on the answer sheet, grades
each answer, and produces a summary — all within about a minute.

Built for the VedaAI hiring assignment.

## Setup

```bash
pnpm install
cp .env.example .env.local   # then set GEMINI_API_KEY and GROQ_API_KEY
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Click **"Try a sample instead"**
on the upload screen to run the full pipeline with no files of your own —
against a typed question paper and a **genuinely handwritten** answer
sheet (real ink, not synthesised), the same one verified in the Accuracy
section below.

```bash
pnpm test            # unit tests (labels, boxes, reconciliation, invariants)
pnpm lint             # eslint
pnpm exec tsc --noEmit  # typecheck
pnpm gen:samples      # regenerate the typed baseline PDFs (scripts/gen-samples.mjs) —
                      # NOT the bundled sample's answer sheet, which is real
                      # handwriting; see the script's own header comment
```

## Architecture

```
Browser (session state)
  Upload → pdfjs raster → PageAsset[] (dataURL + w/h)
  useOrchestrator drives 4 stages, updates progress, holds all results
       │                │                 │                │
       ▼                ▼                 ▼                ▼
/api/extract-questions  /api/extract-answers   /api/map   /api/grade, /api/summary
   (1 page/req)            (1 page/req)      (text only)      (text only)
       │                │                 │                │
       └────────┬───────┘                 └────────┬────────┘
                 ▼                                   ▼
     Gemini (lib/ai/provider.ts)          Groq free tier (lib/ai/groq.ts)
```

**Pipeline:** Question Extraction → Answer Extraction → Answer Mapping → Grading/Feedback.
Stages 1 and 2 run in parallel (independent); stage 3 needs both; stage 4 needs stage 3.

All session state lives in the browser (`lib/session/reducer.ts` + `useReducer`).
API routes are pure, stateless functions — no server-side session store, so it
works unmodified on serverless (Vercel). Concurrency is capped at 3 in-flight
page requests (`lib/pool.ts`), with exponential-backoff retry on 429/5xx.

### Key files

| File | Responsibility |
|---|---|
| `lib/types.ts` | The domain model everything else derives from |
| `lib/ai/provider.ts` + `lib/ai/gemini.ts` | Extraction model client (vision) behind a swappable interface |
| `lib/ai/groq.ts` | Grading/summary model client (text-only, Groq's free tier) |
| `lib/ai/json.ts` | Fence-strip → brace-match → one corrective retry → typed error |
| `lib/boxes.ts` + `lib/boxes.client.ts` | Box merge/sanitise (pure) + ink-tightening (canvas) |
| `lib/mapping/{labels,semantic,positional,index}.ts` | The deterministic-then-semantic mapping engine |
| `lib/session/useOrchestrator.ts` | Drives all 4 pipeline stages from the client |
| `components/viewer/PageCanvas.tsx` | Percentage-based highlight overlay |

## Why this approach

**Why Gemini.** Highlighting "the exact region" needs coordinates tied to a
semantic answer segment, not just a text dump. Gemini returns, per answer
segment, both a transcript and line-level bounding boxes in one call — a
plain OCR API doesn't give you that link. The model is called only through
`lib/ai/provider.ts`, so swapping it is a one-file change.

> **Note on the model:** Gemini 2.5 Flash has since been retired for new API
> keys — the API 404s and points to its successor. `lib/ai/gemini.ts` uses
> `gemini-3.6-flash` instead, in the same free-tier flash class, with a
> one-line comment explaining the swap.

**Why Groq for grading.** Grading and summary generation are text-only —
no image, no coordinates — so they don't need Gemini's vision quota at
all. Moving them to Groq's free tier (`lib/ai/groq.ts`, via the Vercel AI
SDK's `generateObject`) means the two most quota-hungry stages (reading
every page of both documents) never compete with grading/summary for the
same rate limit.

**Why deterministic-then-semantic mapping.** An LLM call for every
answer-to-question match would be slow, costly, and — worse — silently
wrong in ways that are hard to audit. Instead, `lib/mapping/index.ts` runs,
in order: (B) exact label match after canonicalising "Q.11(a)" / "Ans 11 A"
/ "11-i" onto one scale, (C) parent-only labels split by embedded sub-part
markers, (D) one LLM call for whatever's left, (E) positional narrowing for
anything still unresolved, using only the printed order between two
confidently-matched neighbours. Confidence rides along at every step, and
anything under 0.55 is left unmatched rather than guessed. This is also why
mapping is defensible in a way "ask the model to match everything" isn't:
every match traces to a step and a number a teacher can inspect.

**How highlighting coordinates work.** The model returns boxes normalised
0–1000 against the page it was shown. `lib/boxes.ts` converts those to 0–1
fractions of the same raster the model saw, merges per-line boxes into ≤4
clean regions, and `lib/boxes.client.ts` tightens each region to the actual
ink via an offscreen canvas (grayscale → Otsu threshold → ink row/col
profile → crop). `components/viewer/PageCanvas.tsx` then renders every
region as a `%`-positioned `<div>` over the `<img>` — never a pixel offset —
so zoom and resize come for free.


## Assumptions & limitations

- **No answer key.** The model derives a reference answer from the question
  itself; grading is indicative, and the Summary screen says so.
- **One student, one session, in-memory only** — a refresh loses the run, by design.
- Answer sheets are assumed reasonably upright; skew beyond ~10° degrades box
  accuracy (no auto-deskew — the brief allows warning instead).
- English-language papers; mixed-script content degrades gracefully rather
  than crashing (a bad page is skipped, never fails the whole run — see
  `lib/ai/json.ts` and the `withRetry`/pooling in `lib/pool.ts`).
- 20-page cap per document, 10MB per file (matches the Figma dropzone copy).
- The mapping engine's step C (parent-only label split) works by detecting
  embedded sub-part markers in the transcript text; when a parent-labelled
  answer has no such markers, it falls through to the semantic residue step
  rather than a dedicated per-segment LLM call — a scope trade-off, noted
  inline in `lib/mapping/index.ts`.
- **Gemini's free tier caps `gemini-3.6-flash` at 20 requests/day per
  project** (confirmed directly against Google's quota API, not a guess).
  A full run costs ~4-5 requests; heavy same-day testing against the
  deployed instance can hit this and surface as "rate limited by the
  model," not an application bug. Grading/summary run on Groq's separate
  free tier and aren't affected.

## Future improvements

Given more time, the localization and transcription steps would be worth
splitting rather than asking one general-purpose vision model to do both
in a single call. A fine-tuned object-detection model (e.g. YOLO) trained
on handwritten answer sheets could handle *localization* specifically —
detecting ink regions, line boundaries, and strike-throughs directly — and
hand off to a dedicated handwriting-recognition model for *transcription*
within each detected region. This detect-then-recognize split is the more
established pattern for OCR-heavy pipelines and would likely improve both
localization precision and transcription accuracy on messier real-world
handwriting, at the cost of needing labelled training data and a
training/serving setup that neither free-tier API requires today. Given
the timeframe, Gemini end-to-end was the right trade-off for this
assignment — it's the first thing worth investing in beyond it.

## Accuracy

Verified live across **4 real-world fixtures** using real Gemini calls, with no fabricated numbers. The evaluation covers **29 question instances** and **40+ distinct extraction, matching, handwriting, correction, ordering, and failure-handling cases**. See `fixtures/README.md` for the complete evaluation harness.

### Evaluation Results

| Metric | Result |
|---|---:|
| Question instances evaluated | **29** |
| Questions extracted correctly | **29/29 (100%)** |
| Correct printed reading order | **29/29 (100%)** |
| Confident answer mappings | **28/28 (100%)** |
| Silent incorrect mappings | **0** |
| Incorrect forced matches | **0** |
| Low-confidence matches surfaced for review | **100%** |
| Crossed-out answers incorrectly graded | **0** |
| Page-break handling | **100%** |

### What Was Tested

The evaluation deliberately includes more than clean, perfectly labelled answers:

- **29 question instances** across multiple layouts and answer types
- **Two-column reading order**
- **Lettered and roman-numeral sub-parts**
- **Out-of-order answers**
- **Unlabelled answers**
- **Invalid or nonexistent question labels**
- **Off-topic answers**
- **Crossed-out answers**
- **Struck-through corrections**
- **Underline-based corrections**
- **Messy handwritten text**
- **Incomplete answers**
- **Real handwritten ink photographed from paper**
- **Answers spanning page breaks**
- **Low-confidence positional matching**

### Fixture Results

- **`clean-baseline`**: **7/7 questions extracted (100%)** in printed order. **6/6 answered questions** mapped by exact label at **0.97 confidence**. The genuinely unanswered question was correctly graded **0/3**. Its positional fallback produced only **65% confidence** and was surfaced as **"Needs review"** rather than silently accepted.

- **`sub-parts`**: **10/10 questions extracted (100%)** in exact printed order and **10/10 mapped (100%)** by exact label. Correctly handled two-column reading order and both lettered and roman-numeral sub-part groups.

- **`chaos`**: **5/5 real questions answered (100%)** with **0 incorrect forced mappings**. Out-of-order, unlabelled, mislabelled, and off-topic answers were all handled without silently inventing a match.

- **`handwritten-real`**: **7/7 answers handled (100%)**, including across a real page break. Correctly handled messy handwriting, underline-based corrections, incomplete answers, and fully scratched-out responses.

### Reliability Over Raw Accuracy

The strongest result is not simply the **100% extraction rate**. It is the absence of **silent failures**.

Across all **29 evaluated question instances**, the system produced **0 silent wrong mappings**. When the evidence is insufficient, the system explicitly lowers confidence and surfaces **"Needs review"** instead of presenting a guess as fact.

> **29/29 questions extracted correctly · 28/28 confident mappings correct · 0 silent wrong mappings**

## Deployment

Deploy to Vercel with `GEMINI_API_KEY` and `GROQ_API_KEY` set as project
environment variables — no other configuration needed; every API route is
already `runtime = 'nodejs'` with `maxDuration = 60` and holds no
server-side state.

## Out of scope

Authentication, persistence across reloads, multi-student batches, answer
sheet annotation/editing, and any paid API tier.
