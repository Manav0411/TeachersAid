/**
 * Vision/LLM provider interface (PRD §3.1).
 *
 * Highlighting "the exact region" requires coordinates tied to a semantic
 * answer segment, which is why Gemini was chosen (PRD §3). Every call site
 * in this app talks to this interface, never to `@google/genai` directly —
 * swapping models (e.g. to Mistral OCR or Qwen2.5-VL) should be a one-file
 * change in lib/ai/gemini.ts.
 */

export type InlineImage = {
  /** image/jpeg;base64,... or image/png;base64,... data URL. */
  dataUrl: string;
};

export type GenerateJsonOptions = {
  /** The full prompt text (instructions + schema description + rules). */
  prompt: string;
  /** Optional page image to ground the response in. */
  image?: InlineImage;
  /** Optional JSON-schema-shaped object Gemini can constrain output to. */
  responseSchema?: Record<string, unknown>;
};

export interface VisionProvider {
  /**
   * Sends `prompt` (+ optional `image`) to the model and returns the
   * response parsed as JSON. Handles fence-stripping, brace-matching, and
   * one corrective retry internally (PRD §8) — throws ModelJsonError only
   * if every strategy, including the retry, fails.
   */
  generateJson(opts: GenerateJsonOptions): Promise<unknown>;
}
