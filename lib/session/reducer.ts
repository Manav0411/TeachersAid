import type {
  AnswerSegment,
  Grade,
  Mapping,
  PageAsset,
  Question,
  Session,
  SessionStage,
  Summary,
} from "@/lib/types";

export function emptySession(id: string): Session {
  return {
    id,
    questionPages: [],
    answerPages: [],
    questions: [],
    segments: [],
    mappings: [],
    grades: [],
    summary: null,
    stage: "idle",
    progress: { label: "", done: 0, total: 0 },
    errors: [],
  };
}

export type SessionAction =
  | { type: "RESET" }
  | { type: "SET_STAGE"; stage: SessionStage }
  | { type: "SET_PROGRESS"; label: string; done: number; total: number }
  | { type: "ADD_ERROR"; message: string }
  | { type: "SET_QUESTION_PAGES"; pages: PageAsset[] }
  | { type: "SET_ANSWER_PAGES"; pages: PageAsset[] }
  | { type: "SET_QUESTIONS"; questions: Question[] }
  | { type: "SET_SEGMENTS"; segments: AnswerSegment[] }
  | { type: "SET_MAPPINGS"; mappings: Mapping[] }
  | { type: "SET_GRADES"; grades: Grade[] }
  | { type: "SET_SUMMARY"; summary: Summary }
  | {
      type: "REASSIGN_SEGMENT";
      segmentId: string;
      questionId: string | null;
    };

/**
 * All session state lives in the client — the API routes are stateless, so
 * this works unmodified on serverless. This reducer is the single source
 * of truth the whole app reads and writes through.
 */
export function sessionReducer(state: Session, action: SessionAction): Session {
  switch (action.type) {
    case "RESET":
      return emptySession(crypto.randomUUID());
    case "SET_STAGE":
      return { ...state, stage: action.stage };
    case "SET_PROGRESS":
      return {
        ...state,
        progress: { label: action.label, done: action.done, total: action.total },
      };
    case "ADD_ERROR":
      return { ...state, errors: [...state.errors, action.message] };
    case "SET_QUESTION_PAGES":
      return { ...state, questionPages: action.pages };
    case "SET_ANSWER_PAGES":
      return { ...state, answerPages: action.pages };
    case "SET_QUESTIONS":
      return { ...state, questions: action.questions };
    case "SET_SEGMENTS":
      return { ...state, segments: action.segments };
    case "SET_MAPPINGS":
      return { ...state, mappings: action.mappings };
    case "SET_GRADES":
      return { ...state, grades: action.grades };
    case "SET_SUMMARY":
      return { ...state, summary: action.summary };
    case "REASSIGN_SEGMENT": {
      const mappings = state.mappings
        // remove the segment from any mapping it currently belongs to
        .map((m) => {
          if (!m.segmentIds.includes(action.segmentId)) return m;
          const segmentIds = m.segmentIds.filter((id) => id !== action.segmentId);
          if (segmentIds.length > 0 || m.questionId === null) {
            return { ...m, segmentIds };
          }
          // Losing its last segment shouldn't make the question's mapping
          // disappear outright — it just has no answer anymore.
          return {
            ...m,
            segmentIds,
            status: "unanswered" as const,
            method: "manual" as const,
            confidence: 1,
          };
        });

      if (action.questionId === null) {
        mappings.push({
          questionId: null,
          segmentIds: [action.segmentId],
          status: "unmatched",
          method: "manual",
          confidence: 1,
        });
        return { ...state, mappings };
      }

      const existing = mappings.find((m) => m.questionId === action.questionId);
      if (existing) {
        existing.segmentIds.push(action.segmentId);
        existing.status = "answered";
        existing.method = "manual";
        existing.confidence = 1;
      } else {
        mappings.push({
          questionId: action.questionId,
          segmentIds: [action.segmentId],
          status: "answered",
          method: "manual",
          confidence: 1,
        });
      }
      return { ...state, mappings };
    }
    default:
      return state;
  }
}
