/** Grading prompt: derive an expected answer from the question itself, and grade fairly. */
export function buildGradingPrompt(items: {
  question_id: string;
  display_number: string;
  question_text: string;
  type: string;
  max_marks: number;
  student_answer: string;
}[]): string {
  return `You are assisting a teacher grading one student's exam. For each item, produce a fair,
concise assessment. No answer key is available: derive the expected answer from the
question yourself, and be conservative — when the student's answer is defensible, credit it.

ITEMS: ${JSON.stringify(items)}

Return ONLY: {"grades":[{
  "question_id": string,
  "awarded": number,          // 0..max_marks, halves allowed
  "verdict": "correct"|"partially_correct"|"incorrect"|"ungradable",
  "feedback": string,         // ≤2 sentences, written FOR THE TEACHER, specific
  "missed_points": [string],  // ≤3 items
  "confidence": 0.0-1.0
}]}

Use "ungradable" when the transcript is mostly [illegible] or is a diagram you cannot assess.
Never award marks for a blank or struck-through answer.`;
}

export function buildSummaryPrompt(input: {
  grades: {
    display_number: string;
    awarded: number;
    verdict: string;
    feedback: string;
  }[];
  counts: { answered: number; unanswered: number; unmatched: number };
}): string {
  return `You are summarising one student's graded exam for their teacher.
GRADES: ${JSON.stringify(input.grades)}
COUNTS: ${JSON.stringify(input.counts)}
Return ONLY: {"strengths": [string], "weaknesses": [string], "overall_feedback": string}
strengths and weaknesses: up to 3 short items each, grounded in the grades above. When
referring to a specific question, use its display_number exactly as given (e.g. "Q6" or
"question 6") — never invent or repeat an internal id.
overall_feedback: at most 3 sentences, addressed to the teacher.`;
}
