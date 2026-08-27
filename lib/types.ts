/**
 * Domain data model for the assessment extraction pipeline.
 * Everything else in the app derives from these shapes.
 */

/** Normalised to the page: all values 0..1, origin top-left. */
export type BBox = { x: number; y: number; w: number; h: number };

export type PageAsset = {
  index: number; // 0-based, in document order
  width: number; // raster pixel width
  height: number;
  dataUrl: string; // image/jpeg;base64 — client memory only
};

export type QuestionType =
  | "mcq"
  | "short"
  | "long"
  | "numerical"
  | "diagram"
  | "other";

export type Question = {
  id: string; // stable slug: "q-11-a"
  displayNumber: string; // EXACTLY as printed: "11 (a)", "Q.3", "(iii)"
  sortKey: number[]; // [11, 1] — drives printed-order sorting
  parentNumber?: string; // "11" for sub-parts
  text: string;
  options?: { label: string; text: string }[]; // MCQ
  marks?: number;
  type: QuestionType;
  section?: string; // "Section B"
  instruction?: string; // "Attempt any two"
  pageIndex: number;
  bbox?: BBox; // where the question sits on the paper
};

export type AnswerRegion = { pageIndex: number; bbox: BBox };

export type AnswerSegment = {
  id: string; // "seg-p2-3"
  detectedLabel: string | null; // what the student wrote: "11(a)", "Ans 4", null
  transcript: string;
  regions: AnswerRegion[]; // ≥1; multiple = multi-page or multi-column answer
  isContinuation: boolean; // "contd. from previous page"
  isStruckThrough: boolean; // crossed out by the student
  legibility: "clear" | "partial" | "illegible";
  confidence: number; // 0..1, OCR confidence
};

export type MappingStatus = "answered" | "unanswered" | "unmatched";
export type MappingMethod = "label" | "semantic" | "positional" | "manual";

export type Mapping = {
  questionId: string | null; // null ⇒ orphan answer
  segmentIds: string[]; // ordered; >1 when the answer continues
  status: MappingStatus;
  method: MappingMethod;
  confidence: number;
  rationale?: string; // one line, shown on hover
};

export type Verdict =
  | "correct"
  | "partially_correct"
  | "incorrect"
  | "unanswered"
  | "ungradable";

export type Grade = {
  questionId: string;
  awarded: number;
  max: number;
  verdict: Verdict;
  feedback: string; // ≤2 sentences, addressed to the teacher
  missedPoints: string[];
  gradingConfidence: number;
};

export type Summary = {
  totalAwarded: number;
  totalMax: number;
  percentage: number;
  answered: number;
  unanswered: number;
  unmatched: number;
  strengths: string[];
  weaknesses: string[];
  overallFeedback: string;
};

export type SessionStage =
  | "idle"
  | "rasterising"
  | "questions"
  | "answers"
  | "mapping"
  | "grading"
  | "done"
  | "error";

export type Session = {
  id: string;
  questionPages: PageAsset[];
  answerPages: PageAsset[];
  questions: Question[];
  segments: AnswerSegment[];
  mappings: Mapping[];
  grades: Grade[];
  summary: Summary | null;
  stage: SessionStage;
  progress: { label: string; done: number; total: number };
  errors: string[];
};
