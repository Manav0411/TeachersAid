/** Verbatim from PRD §6.2. */
export const QUESTIONS_PROMPT = `You are extracting questions from a scanned exam question paper page.

Return ONLY a JSON object matching this schema — no markdown, no prose:
{
  "section": string | null,          // section heading visible on this page, e.g. "Section B"
  "questions": [
    {
      "display_number": string,      // EXACTLY as printed, e.g. "11 (a)", "Q.3", "(iii)"
      "parent_number": string | null,// "11" if this is a sub-part, else null
      "text": string,                // full question text, no number prefix
      "options": [{"label":"A","text":"..."}] | null,
      "marks": number | null,
      "type": "mcq"|"short"|"long"|"numerical"|"diagram"|"other",
      "instruction": string | null,  // e.g. "Attempt any two"
      "continues_from_previous_page": boolean,
      "continues_on_next_page": boolean,
      "box_2d": [ymin, xmin, ymax, xmax]   // 0-1000 normalised
    }
  ]
}

Rules:
1. Every labelled sub-part is its own entry. "11 (a)" and "11 (b)" are TWO entries.
   If a parent number has introductory text plus sub-parts, emit the parent as its own
   entry ONLY if it carries a question of its own; otherwise put the shared stem at the
   start of each sub-part's text and set parent_number.
2. Preserve numbering exactly as printed. Do not renumber, normalise, or reformat.
3. Keep printed reading order (top-to-bottom; for two-column layouts, finish the left
   column before the right).
4. Do not invent questions. Do not include instructions, headers, or marks tables as questions.
5. If a question is cut off at the page edge, still emit it and set the continues_* flag.`;
