/**
 * Generic retry-with-backoff used by every outbound Polymarket call and by
 * the sync orchestration's per-item processing. Kept dependency-free (no
 * fetch/DB knowledge) so it's trivial to unit test.
 */

export class RetryableError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly status: number | null;

  constructor(
    message: string,
    options: { retryable?: boolean; retryAfterMs?: number | null; status?: number | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "RetryableError";
    this.retryable = options.retryable ?? true;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.status = options.status ?? null;
  }
}

export interface BackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
}

/**
 * "Full jitter" exponential backoff (as recommended by AWS's backoff
 * literature): delay is a random value between 0 and the exponential cap
 * for this attempt, so many parallel retriers don't all collide on the same
 * instant. `attempt` is 1-indexed (the first retry is attempt 1).
 */
export function computeBackoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 8_000;
  const random = options.random ?? Math.random;

  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(random() * cap);
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  isRetryable?: (error: unknown) => boolean;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  sleep?: (ms: number) => Promise<void>;
}

function defaultIsRetryable(error: unknown): boolean {
  return error instanceof RetryableError ? error.retryable : true;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` up to `maxAttempts` times. On a retryable failure, waits for
 * exponential backoff (or the upstream's `Retry-After`, when the thrown
 * error carries one via `RetryableError.retryAfterMs`) before trying again.
 * Rethrows the last error once attempts are exhausted or the error is
 * classified as non-retryable.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !isRetryable(error)) {
        throw error;
      }

      const retryAfterMs = error instanceof RetryableError ? error.retryAfterMs : null;
      const delayMs =
        retryAfterMs ??
        computeBackoffDelay(attempt, {
          baseDelayMs: options.baseDelayMs,
          maxDelayMs: options.maxDelayMs,
          random: options.random,
        });

      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  // Unreachable: the loop above always returns or throws.
  throw lastError;
}
