import { GoogleGenAI } from "@google/genai";
import type { GenerateJsonOptions, VisionProvider } from "./provider";
import { ModelJsonError, parseModelJson } from "./json";

// Gemini 2.5 Flash has been retired for new API keys (the API now 404s and
// points here) — gemini-3.6-flash is its direct successor in the same
// free-tier flash tier.
const MODEL = "gemini-3.6-flash";

const RETRY_INSTRUCTION =
  "\n\nYour previous reply was not valid JSON. Return only the JSON object.";

function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:(.+?);base64,([\s\S]*)$/);
  if (!match) {
    throw new Error("Expected a base64 data URL (data:<mime>;base64,<data>)");
  }
  return { mimeType: match[1], data: match[2] };
}

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  client = new GoogleGenAI({ apiKey });
  return client;
}

function buildContents(prompt: string, image?: { dataUrl: string }) {
  const parts: Array<Record<string, unknown>> = [];
  if (image) {
    const { mimeType, data } = parseDataUrl(image.dataUrl);
    parts.push({ inlineData: { mimeType, data } });
  }
  parts.push({ text: prompt });
  return [{ role: "user", parts }];
}

async function callModel(
  prompt: string,
  image: { dataUrl: string } | undefined,
  responseSchema: Record<string, unknown> | undefined
): Promise<string> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildContents(prompt, image),
    config: {
      responseMimeType: "application/json",
      ...(responseSchema ? { responseJsonSchema: responseSchema } : {}),
    },
  });

  const text = response.text;
  if (text === undefined) {
    const err = new Error("Model returned no text") as Error & {
      status?: number;
      retryable?: boolean;
    };
    err.retryable = true;
    throw err;
  }
  return text;
}

class GeminiProvider implements VisionProvider {
  async generateJson(opts: GenerateJsonOptions): Promise<unknown> {
    const { prompt, image, responseSchema } = opts;

    const first = await callModel(prompt, image, responseSchema);
    try {
      return parseModelJson(first);
    } catch (firstErr) {
      if (!(firstErr instanceof ModelJsonError)) throw firstErr;

      // One corrective retry: ask the model to fix its own output.
      const second = await callModel(
        prompt + RETRY_INSTRUCTION,
        image,
        responseSchema
      );
      return parseModelJson(second); // throws ModelJsonError on second failure
    }
  }
}

export const geminiProvider: VisionProvider = new GeminiProvider();
