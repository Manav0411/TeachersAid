/**
 * Model output hardening (PRD §8).
 *
 * Untrusted model text -> JSON, via a cascade of increasingly forgiving
 * strategies. Never throws a raw parse error past this module — callers
 * get either a parsed value or a ModelJsonError they can act on (typically:
 * ask the model to retry once, then degrade gracefully).
 */

export class ModelJsonError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "ModelJsonError";
  }
}

/** Strip ```json ... ``` / ``` ... ``` fences, if present. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/** Extract the outermost {...} object by brace matching, ignoring braces in strings. */
function extractOutermostObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Attempt to parse `text` as JSON, trying (in order): direct parse, parse
 * after stripping markdown fences, parse of the outermost {...} block.
 * Throws ModelJsonError if every strategy fails.
 */
export function parseModelJson(text: string): unknown {
  const attempts: Array<() => unknown> = [
    () => JSON.parse(text),
    () => JSON.parse(stripFences(text)),
    () => {
      const obj = extractOutermostObject(stripFences(text));
      if (!obj) throw new Error("no JSON object found");
      return JSON.parse(obj);
    },
  ];

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // try the next strategy
    }
  }

  throw new ModelJsonError("Could not parse model output as JSON", text);
}
