/** Verbatim from PRD §6.4 step D — semantic match for the residue after
 * deterministic label/parent matching has run. */
export function buildMappingPrompt(input: {
  questions: { id: string; display_number: string; text: string; type: string }[];
  answers: { id: string; transcript_first_400_chars: string }[];
}): string {
  return `Match each student answer to the question it answers.
QUESTIONS: ${JSON.stringify(input.questions)}
UNMATCHED ANSWERS: ${JSON.stringify(input.answers)}
Return ONLY: {"matches":[{"answer_id":"seg-p2-1","question_id":"q-7"|null,
"confidence":0.0-1.0,"reason":"one short clause"}]}
Rules: one answer maps to at most one question; one question receives at most one answer.
Return question_id null when nothing fits — an answer to no question is a valid outcome.
An answer that merely mentions a keyword from a question is NOT a match.`;
}
