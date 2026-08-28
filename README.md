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
on the upload screen to run the full pipeline against a bundled sample paper
with no files of your own.

```bash
pnpm test            # unit tests (labels, boxes, reconciliation, invariants)
pnpm lint             # eslint
pnpm exec tsc --noEmit  # typecheck
pnpm gen:samples      # regenerate the bundled sample PDFs (scripts/gen-samples.mjs)
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

## Design

The Figma (`GEjt1rt1s7AXvkcr4t8muE`) supplied the **design language** — the
VedaAI app shell, Inter/Bricolage Grotesque type, pill shapes, mascot
illustration — which this app wears throughout (the mascot itself is
cropped straight from the Figma canvas, since the shared file is
viewer-only and has no asset-export access). The Figma covers three
screens, each with a desktop and phone frame; this app needed several
more (a real processing stepper, filters, an unmatched-answers tray,
manual override, a summary view, mobile nav) — those are original layouts
in the same language rather than a pixel clone, per explicit sign-off to
prioritize matching design *language* over an exact clone.

The accent palette was later swapped from the Figma's original
orange/red to a calmer blue/green (`app/globals.css`), sampled from
[intelgrader.com](https://intelgrader.com) per follow-up design feedback —
every color lives behind a handful of CSS custom properties, so the whole
app recolors from that one file.

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

## Accuracy

Verified live against the bundled sample (`fixtures/clean-baseline`, real
Gemini calls, no fabricated numbers): **7/7 questions extracted in printed
order** with the struck-through/clean duplicate for Q1 both preserved and
correctly disambiguated; **6/7 answered questions mapped correctly by exact
label** (0.97 confidence each); the unanswered question was correctly
graded 0/3 with "student did not attempt" feedback, though the mapping
engine's positional-narrowing step attached a low-confidence (65%) guess to
it — flagged **"Needs review"** rather than presented as fact, which is
exactly the point: zero silent wrong mappings. See `fixtures/README.md`
for the full harness and how to extend it with real handwritten scans.

## Deployment

Deploy to Vercel with `GEMINI_API_KEY` and `GROQ_API_KEY` set as project
environment variables — no other configuration needed; every API route is
already `runtime = 'nodejs'` with `maxDuration = 60` and holds no
server-side state.

## Out of scope

Authentication, persistence across reloads, multi-student batches, answer
sheet annotation/editing, and any paid API tier.
