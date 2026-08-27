/**
 * Concurrency + retry helpers.
 *
 * Concurrency is capped at 3 in-flight page requests to stay well under
 * Gemini free-tier rate limits. Retries use exponential backoff on 429/5xx.
 */

/** A simple counting semaphore. */
export class Semaphore {
  private available: number;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {
    this.available = max;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.available--;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.available++;
    const next = this.queue.shift();
    if (next) next();
  }

  /** Run `fn` once a slot is available, releasing it afterwards regardless of outcome. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/** Shared pool for all page-level Gemini calls (extract-questions, extract-answers). */
export const pagePool = new Semaphore(3);

export type RetryableError = Error & {
  status?: number;
  retryable?: boolean;
  // The `ai` SDK's APICallError (thrown by lib/ai/groq.ts) shapes errors
  // differently from @google/genai: `statusCode` instead of `status`, and
  // its own `isRetryable` the SDK already computed from the response.
  statusCode?: number;
  isRetryable?: boolean;
};

function isRetryable(err: unknown): boolean {
  const e = err as RetryableError;
  if (e?.retryable === true || e?.isRetryable === true) return true;
  const status = e?.status ?? e?.statusCode;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }
  return false;
}

/**
 * Retry `fn` on 429/5xx with exponential backoff: 250ms → 1s → 4s, 3 attempts
 * total (i.e. up to 2 retries after the first try).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number; onRetry?: (err: unknown) => void } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 250;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1 || !isRetryable(err)) throw err;
      opts.onRetry?.(err);
      const delay = baseDelayMs * Math.pow(4, i); // 250ms, 1s, 4s
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
