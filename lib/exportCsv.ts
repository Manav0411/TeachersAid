import type { Session } from "@/lib/types";

/**
 * Builds a CSV report of a graded session — one row per question in
 * printed order, plus a trailing summary block. Pure string building,
 * no Blob/DOM APIs, so it's unit-testable like the rest of lib/; the
 * browser download itself happens at the call site (ReviewScreen).
 */

const HEADER = ["#", "Question", "Verdict", "Score", "Max", "Feedback"];

/** RFC 4180: quote any field containing a comma, quote, or newline;
 * double up embedded quotes. Question text and feedback are free text
 * and will routinely contain commas. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

export function buildGradesCsv(session: Session): string {
  const gradeByQuestion = new Map(session.grades.map((g) => [g.questionId, g]));
  const lines = [csvRow(HEADER)];

  for (const q of session.questions) {
    const grade = gradeByQuestion.get(q.id);
    lines.push(
      csvRow([
        q.displayNumber,
        q.text,
        grade?.verdict ?? "",
        grade ? String(grade.awarded) : "",
        grade ? String(grade.max) : "",
        grade?.feedback ?? "",
      ])
    );
  }

  const { summary } = session;
  if (summary) {
    lines.push("");
    lines.push(csvRow(["Total score", `${summary.totalAwarded}/${summary.totalMax}`]));
    lines.push(csvRow(["Percentage", `${summary.percentage}%`]));
    lines.push(csvRow(["Overall feedback", summary.overallFeedback]));
  }

  return lines.join("\r\n");
}
