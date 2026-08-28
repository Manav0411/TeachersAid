import { z } from "zod";

/**
 * Zod schemas for (a) the raw, untrusted JSON shapes returned by the model
 * (snake_case, 0-1000 normalised boxes — see lib/prompts) and (b) the API
 * request/response envelopes. Model output must never be trusted directly
 * — always parse through these first.
 *
 * Raw (model) shapes are intentionally distinct from the domain types in
 * lib/types.ts; a normalise*() function in the relevant lib/ module bridges
 * each raw shape into its domain equivalent.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** [ymin, xmin, ymax, xmax], each 0-1000 — the model's native coordinate space. */
export const RawBox2d = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const QuestionTypeSchema = z.enum([
  "mcq",
  "short",
  "long",
  "numerical",
  "diagram",
  "other",
]);

// ---------------------------------------------------------------------------
// Stage 1 — question extraction
// ---------------------------------------------------------------------------

export const RawQuestionOption = z.object({
  label: z.string(),
  text: z.string(),
});

export const RawQuestion = z.object({
  display_number: z.string(),
  parent_number: z.string().nullable(),
  text: z.string(),
  options: z.array(RawQuestionOption).nullable().optional(),
  marks: z.number().nullable().optional(),
  type: QuestionTypeSchema,
  instruction: z.string().nullable().optional(),
  continues_from_previous_page: z.boolean().default(false),
  continues_on_next_page: z.boolean().default(false),
  box_2d: RawBox2d.optional(),
});
export type RawQuestion = z.infer<typeof RawQuestion>;

export const ExtractQuestionsModelResponse = z.object({
  section: z.string().nullable().optional(),
  questions: z.array(RawQuestion),
});
export type ExtractQuestionsModelResponse = z.infer<
  typeof ExtractQuestionsModelResponse
>;

// ---------------------------------------------------------------------------
// Stage 2 — answer extraction
// ---------------------------------------------------------------------------

export const LegibilitySchema = z.enum(["clear", "partial", "illegible"]);

export const RawAnswerSegment = z.object({
  detected_label: z.string().nullable(),
  transcript: z.string(),
  is_continuation: z.boolean().default(false),
  continues_on_next_page: z.boolean().default(false),
  is_struck_through: z.boolean().default(false),
  legibility: LegibilitySchema,
  confidence: z.number().min(0).max(1),
  line_boxes: z.array(RawBox2d),
});
export type RawAnswerSegment = z.infer<typeof RawAnswerSegment>;

export const ExtractAnswersModelResponse = z.object({
  page_notes: z.string().nullable().optional(),
  segments: z.array(RawAnswerSegment),
});
export type ExtractAnswersModelResponse = z.infer<
  typeof ExtractAnswersModelResponse
>;

// ---------------------------------------------------------------------------
// Stage 3 — mapping (semantic match for the residue)
// ---------------------------------------------------------------------------

export const MapQuestionInput = z.object({
  id: z.string(),
  display_number: z.string(),
  text: z.string(),
  type: QuestionTypeSchema,
});
export type MapQuestionInput = z.infer<typeof MapQuestionInput>;

export const MapAnswerInput = z.object({
  id: z.string(),
  transcript_first_400_chars: z.string(),
});
export type MapAnswerInput = z.infer<typeof MapAnswerInput>;

export const RawMapMatch = z.object({
  answer_id: z.string(),
  question_id: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});
export type RawMapMatch = z.infer<typeof RawMapMatch>;

export const MapModelResponse = z.object({
  matches: z.array(RawMapMatch),
});
export type MapModelResponse = z.infer<typeof MapModelResponse>;

// ---------------------------------------------------------------------------
// Stage 4 — grading & feedback
// ---------------------------------------------------------------------------

export const VerdictSchema = z.enum([
  "correct",
  "partially_correct",
  "incorrect",
  "unanswered",
  "ungradable",
]);

export const GradeItemInput = z.object({
  question_id: z.string(),
  display_number: z.string(),
  question_text: z.string(),
  type: QuestionTypeSchema,
  max_marks: z.number(),
  student_answer: z.string(),
});
export type GradeItemInput = z.infer<typeof GradeItemInput>;

// No .default([]) here: this schema also doubles as the structured-output
// schema for the grading model call (lib/ai/groq.ts), and Groq/OpenAI's
// strict JSON-schema mode rejects any property with a default that's
// therefore missing from `required` — the model must always supply
// missed_points itself (an empty array is a valid answer).
export const RawGrade = z.object({
  question_id: z.string(),
  // No upper bound here — the ceiling is per-question max_marks, which
  // isn't in this schema's scope. fromRawGrade() (lib/grading/normalise.ts)
  // clamps to [0, max] once it has both values.
  awarded: z.number().min(0),
  verdict: VerdictSchema,
  feedback: z.string(),
  missed_points: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type RawGrade = z.infer<typeof RawGrade>;

export const GradeModelResponse = z.object({
  grades: z.array(RawGrade),
});
export type GradeModelResponse = z.infer<typeof GradeModelResponse>;

export const SummaryModelResponse = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  overall_feedback: z.string(),
});
export type SummaryModelResponse = z.infer<typeof SummaryModelResponse>;

// ---------------------------------------------------------------------------
// API envelopes — every route returns one of these, Zod-validated
// on both ends.
// ---------------------------------------------------------------------------

export const ApiErrorCode = z.enum([
  "invalid_request",
  "model_error",
  "invalid_model_output",
  "rate_limited",
  "timeout",
  "unknown",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({
  code: ApiErrorCode,
  message: z.string(),
  retryable: z.boolean(),
});
export type ApiError = z.infer<typeof ApiError>;

export function ApiOk<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ ok: z.literal(true), data: dataSchema });
}

export const ApiErr = z.object({ ok: z.literal(false), error: ApiError });
export type ApiErr = z.infer<typeof ApiErr>;

export function ApiResponse<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion("ok", [ApiOk(dataSchema), ApiErr]);
}

// ---------------------------------------------------------------------------
// Route payloads
// ---------------------------------------------------------------------------

export const PageAssetInput = z.object({
  index: z.number().int().nonnegative(),
  dataUrl: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type PageAssetInput = z.infer<typeof PageAssetInput>;

export const ExtractQuestionsRequest = z.object({ page: PageAssetInput });
export const ExtractAnswersRequest = z.object({ page: PageAssetInput });

export const MapRequest = z.object({
  questions: z.array(MapQuestionInput),
  segments: z.array(MapAnswerInput),
});

export const GradeRequest = z.object({
  items: z.array(GradeItemInput),
});

export const SummaryCountsInput = z.object({
  answered: z.number(),
  unanswered: z.number(),
  unmatched: z.number(),
});

/** Same shape as RawGrade but with the human-readable display_number instead
 * of the internal question_id, so the summary model's prose is legible. */
export const SummaryGradeInput = z.object({
  display_number: z.string(),
  awarded: z.number(),
  verdict: VerdictSchema,
  feedback: z.string(),
  missed_points: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type SummaryGradeInput = z.infer<typeof SummaryGradeInput>;

export const SummaryRequest = z.object({
  grades: z.array(SummaryGradeInput),
  counts: SummaryCountsInput,
});
