import "server-only";
import { RetryableError, withRetry } from "@/lib/sync/retry";

export interface FetchJsonOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  /** Passed through to `fetch` (e.g. `next: { revalidate }`); avoid setting `signal` here. */
  init?: RequestInit;
}

function parseRetryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/**
 * Fetches `url` and parses the response as JSON, retrying transient
 * failures (timeouts, 429s honoring `Retry-After`, and 5xx responses) with
 * exponential backoff. 4xx responses other than 429 are treated as
 * non-retryable — retrying a malformed request just wastes the budget.
 */
export async function fetchJsonWithRetry(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxAttempts = options.maxAttempts ?? 3;

  return withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, { ...options.init, signal: controller.signal, cache: "no-store" });

        if (!res.ok) {
          const retryAfterMs = res.status === 429 ? parseRetryAfterMs(res) : null;
          const retryable = res.status === 429 || res.status >= 500;
          throw new RetryableError(`Request to ${url} failed with status ${res.status}`, {
            retryable,
            retryAfterMs,
            status: res.status,
          });
        }

        return await res.json();
      } catch (error) {
        if (error instanceof RetryableError) throw error;
        // AbortError (timeout) and network failures (fetch failed / ENOTFOUND) are transient.
        throw new RetryableError(`Request to ${url} failed: ${(error as Error).message}`, {
          retryable: true,
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
    { maxAttempts },
  );
}
