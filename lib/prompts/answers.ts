/** Answer extraction prompt — the highest-risk, highest-leverage prompt in the app. */
export const ANSWERS_PROMPT = `You are reading one page of a student's handwritten answer sheet.

Segment the page into ANSWER SEGMENTS. A segment is a contiguous block of writing that
answers one question. Return ONLY JSON:
{
  "page_notes": string | null,       // e.g. "page appears rotated", "margin notes present"
  "segments": [
    {
      "detected_label": string | null,   // the question number the student wrote,
                                         // verbatim: "11(a)", "Ans 4", "Q7". null if absent.
      "transcript": string,              // faithful transcription. Use [illegible] for
                                         // unreadable words. Describe drawings as
                                         // [diagram: labelled cross-section of a leaf].
      "is_continuation": boolean,        // continues an answer from an earlier page
                                         // (e.g. "contd.", or starts mid-sentence at the top)
      "continues_on_next_page": boolean,
      "is_struck_through": boolean,      // the student crossed this out
      "legibility": "clear"|"partial"|"illegible",
      "confidence": 0.0-1.0,
      "line_boxes": [[ymin,xmin,ymax,xmax], ...]  // 0-1000 normalised, ONE BOX PER
                                                  // WRITTEN LINE of this segment
    }
  ]
}

Rules:
1. Order segments in reading order: top to bottom, left column fully before right column.
2. A new segment starts at an explicit question label, a clear vertical gap, or a
   horizontal rule drawn by the student.
3. line_boxes must tightly bound only the ink of this segment. Do NOT return one giant
   box spanning the whole page. Do NOT include the ruled margin line or page number.
4. If the student answered the same question twice, emit both segments and mark the
   crossed-out one is_struck_through: true.
5. Rough work in a margin or under a "Rough work" heading: emit it with
   detected_label: null and prefix the transcript with "[rough work] ".`;
